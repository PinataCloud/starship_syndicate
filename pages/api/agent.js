import { factions } from "../../factions";
import OpenAI from "openai";
const pinataSDK = require('@pinata/sdk');
const pinata = new pinataSDK(process.env.PINATA_KEY, process.env.PINATA_SECRET);
const ethers = require('ethers');
import { TokenboundClient } from "@tokenbound/sdk";
import { encrypt } from "@/components/encryption";
const provider = new ethers.AlchemyProvider("maticmum", process.env.ALCHEMY_API_KEY);

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY,
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const mintNft = async (CID, walletAddress) => {
  try {
    const data = JSON.stringify({
      recipient: `polygon:${walletAddress}`,
      metadata: process.env.PINATA_GATEWAY + CID
    })
    const res = await fetch(`https://staging.crossmint.com/api/2022-06-09/collections/${process.env.CROSSMINT_COLLECTION_ID}/nfts`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-client-secret': `${process.env.CROSSMINT_CLIENT_SECRET}`,
        'x-project-id': `${process.env.CROSSMINT_PROJECT_ID}`
      },
      body: data
    })
    const resData = await res.json()
    const contractAddress = resData.onChain.contractAddress
    console.log("NFT Minted, smart contract:", contractAddress)
    if (resData.onChain.status === "pending") {
      while (true) {
        await delay(10000)

        const mintStatus = await fetch(`https://staging.crossmint.com/api/2022-06-09/collections/${process.env.CROSSMINT_COLLECTION_ID}/nfts/${resData.id}`, {
          method: 'GET',
          headers: {
            accept: 'application/json',
            'x-client-secret': `${process.env.CROSSMINT_CLIENT_SECRET}`,
            'x-project-id': `${process.env.CROSSMINT_PROJECT_ID}`
          }
        })

        const mintStatusJson = await mintStatus.json()

        if (mintStatusJson.onChain.status === "success") {
          console.log(mintStatusJson)
          return mintStatusJson
        }
      }
    }
  } catch (error) {
    console.log(error)
  }
}

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      console.log("Generating agent name...");
      //  AI generated agent name/symbol
      const generatedName = await openai.chat.completions.create({
        messages: [
          {
            role: "user",
            content:
              "Please provide a fun space cowboy style name that is no more than 14 characters long and is in the style of the TV show Firefly or the movie Star Wars.",
          },
        ],
        model: "gpt-3.5-turbo",
        temperature: 1.5
      });      

      const { choices } = generatedName
      const name = choices[0].message.content;
      console.log(name);

      //  Randomly select faction
      const factionSelected =
        factions[Math.floor(Math.random() * factions.length)];

      let opts = {
        symbol: name.split(" ").join("-"),
        faction: factionSelected.symbol,
      };

      console.log("Creating agent...");

      const response = await fetch("https://api.spacetraders.io/v2/register", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(opts)
      });

      if(!response.ok) {
        throw new Error("Unable to create agent");
      }

      const json = await response.json();
      const { data } = json;

      console.log("Agent created!");

      const { token } = JSON.parse(JSON.stringify(data));

      //  Store token and wallet private key in DB mapped to Agent ID
      
      const serverWallet = new ethers.Wallet(process.env.SERVER_WALLET_PRIVATE_KEY, provider);
      
      console.log("Creating agent wallet");
      const wallet = ethers.Wallet.createRandom();
      console.log({agentWallet: wallet.address});
      const privateKey = wallet.privateKey;
      const walletAddress = wallet.address;

      const payloadToEncrypt = {
        token, 
        privateKey
      }

      console.log("Encrypting agent token and private key...");

      const encrypted = encrypt(JSON.stringify(payloadToEncrypt));

      console.log("Encrypted value ", encrypted);

      console.log("Storing encrypted data to IPFS...");

      const encryptedJson = {
        value: encrypted
      }

      await pinata.pinJSONToIPFS(encryptedJson, { pinataMetadata: { name: `Encryption for: ${data.agent.symbol}`, keyvalues: { 'starshipAccounts': 'true', accountId: data.agent.accountId } } })

      console.log("Saved to IPFS!");

      const tokenboundClient = new TokenboundClient({ signer: serverWallet, chainId: 80001 })

      delete data.token;

      const agentMetadata = {
        name: opts.symbol,
        description: `Space cowboy in the ${opts.faction} faction`,
        faction: data.faction,
        data: data.agent
      }

      console.log("Uploading agent NFT metadata to IPFS...");

      const { IpfsHash: agentHash } = await pinata.pinJSONToIPFS(agentMetadata, { pinataMetadata: { name: data.agent.symbol, keyvalues: { 'accountId': data.agent.accountId } } })
      console.log({ agentHash });

      const shipMetadata = {
        name: data.ship.symbol,
        data: data.ship
      }

      console.log("Uploading ship NFT metadata to IPFS...");
      const { IpfsHash: shipHash } = await pinata.pinJSONToIPFS(shipMetadata, { pinataMetadata: { name: data.ship.symbol, keyvalues: { 'shipAccountId': data.agent.accountId } } })
      console.log({ shipHash });

      const contractMetadata = {
        name: `${data.contract.id}`,
        description: `${data.contract.type} Contract`
      }

      console.log("Uploading contract NFT metadata to IPFS...");
      
      const { IpfsHash: contractHash } = await pinata.pinJSONToIPFS(contractMetadata, { pinataMetadata: { name: data.contract.id, keyvalues: { 'contractAccountId': data.agent.accountId } } })
      console.log({ contractHash });

      //  Mint Agent NFT from Agent Wallet

      console.log("Minting agent NFT...")
      const agentNFT = await mintNft(agentHash, walletAddress)
      console.log({agentNFT});

      console.log("Creating token bound account");
      //  Create TBA from Agent NFT
      const tokenBoundAccount = await tokenboundClient.createAccount({
        tokenContract: agentNFT.onChain.contractAddress,
        tokenId: agentNFT.onChain.tokenId,
      })

      console.log({tokenBoundAccount});

      console.log("Minting ship NFT and contract NFT into token bound account...")
      //  Mint Ship NFT into Agent TBA
      mintNft(shipHash, tokenBoundAccount)

      //  Mint Contract NFT into Agent TBA
      mintNft(contractHash, tokenBoundAccount)

      console.log("Done!");
      return res.json(data);
    } catch (error) {
      console.log(error);
      return res.status(500).send("Server error");
    }
  }
}
