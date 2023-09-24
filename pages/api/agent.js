import { factions } from "../../factions";
import OpenAI from "openai";
const pinataSDK = require('@pinata/sdk');
const pinata = new pinataSDK(process.env.PINATA_KEY, process.env.PINATA_SECRET);
const ethers = require('ethers');
import { TokenboundClient } from "@tokenbound/sdk";
const provider = new ethers.AlchemyProvider("maticmum", process.env.ALCHEMY_API_KEY);

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY,
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
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
      });

      const { choices } = generatedName
      const name = choices[0].message.content;

      //  Randomly select faction
      const factionSelected =
        factions[Math.floor(Math.random() * factions.length)];

      let opts = {
        symbol: name.split(" ").join("-"),
        faction: factionSelected.symbol,
      };

      const response = await fetch("https://api.spacetraders.io/v2/register", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(opts)
      });

      const json = await response.json();
      const { data } = json;

      const { token } = JSON.parse(JSON.stringify(data));

      //  Store token and wallet private key in DB mapped to Agent ID

      //  @TODO STEVE Generate Agent Wallet
      const serverWallet = new ethers.Wallet(process.env.SERVER_WALLET_PRIVATE_KEY, provider);
      console.log(serverWallet.address)
      const wallet = ethers.Wallet.createRandom();
      // Justin here is the keys
      const privateKey = wallet.privateKey;
      const walletAddress = wallet.address;

      const tokenboundClient = new TokenboundClient({ signer: serverWallet, chainId: 80001 })

      //  @TODO JUSTIN map agent, wallet, and token and add to DB

      delete data.token;

      const agentMetadata = {
        name: opts.symbol,
        description: `Space cowboy in the ${opts.faction} faction`,
        faction: data.faction,
        data: data.agent,
        image: "ipfs://QmXGQn7hGRZXrXMopHYyosTFLzRUbXrFY1g8Svu8cZuUea"
      }

      const { IpfsHash: agentHash } = await pinata.pinJSONToIPFS(agentMetadata, { pinataMetadata: { name: data.agent.symbol, keyvalues: { 'accountId': data.agent.accountId } } })
      console.log({ agentHash });

      const shipMetadata = {
        name: `ship: ${data.ship.symbol}`,
        data: data.ship,
        image: "ipfs://QmXGQn7hGRZXrXMopHYyosTFLzRUbXrFY1g8Svu8cZuUea"
      }

      const { IpfsHash: shipHash } = await pinata.pinJSONToIPFS(shipMetadata, { pinataMetadata: { name: data.ship.symbol, keyvalues: { 'shipAccountId': data.agent.accountId } } })
      console.log({ shipHash });

      const contractMetadata = {
        name: `Contract: ${data.contract.id}`,
        description: `${data.contract.type} Contract`,
        ipfs: "ipfs://Qmeat5p4PzYtNYtV7TPXf64V3T6imayG8i3eALcVjGFR6S"
      }

      const { IpfsHash: contractHash } = await pinata.pinJSONToIPFS(contractMetadata, { pinataMetadata: { name: data.contract.id, keyvalues: { 'contractAccountId': data.agent.accountId } } })
      console.log({ contractHash });

      //  @TODO STEVE

      //  Mint Agent NFT from Agent Wallet

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
              delay(10000)

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

      const agentNFT = await mintNft(agentHash, walletAddress)



      //  Create TBA from Agent NFT
      const tokenBoundAccount = await tokenboundClient.createAccount({
        tokenContract: agentNFT.onChain.contractAddress,
        tokenId: agentNFT.onChain.tokenId,
      })

      console.log(tokenBoundAccount)

      //  Mint Ship NFT into Agent TBA
      //
      const shipNFT = mintNft(shipHash, tokenBoundAccount)

      //  Mint Contract NFT into Agent TBA
      //
      const contractNFT = mintNft(contractHash, tokenBoundAccount)

      res.json(data);
      // //  Write to IPFS using Pinata (metadata should represent accountID)

    } catch (error) {
      console.log(error);
      return res.status(500).send("Server error");
    }
  }
}
