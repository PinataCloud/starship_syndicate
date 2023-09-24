import { decrypt } from '@/components/encryption';

const pinataSDK = require('@pinata/sdk');
const pinata = new pinataSDK(process.env.PINATA_KEY, process.env.PINATA_SECRET);
const FULL_URL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000/api/'
const ethers = require('ethers');
const provider = new ethers.AlchemyProvider("maticmum", process.env.ALCHEMY_API_KEY);
import { TokenboundClient } from "@tokenbound/sdk";
const { Alchemy, Network } = require("alchemy-sdk");

// Configures the Alchemy SDK
const config = {
  apiKey: process.env.ALCHEMY_API_KEY,
  network: Network.MATIC_MUMBAI, // Replace with your network
};

// Creates an Alchemy object instance with the config to use for making requests
const alchemy = new Alchemy(config);

//  @TODO create a secret that is passed in from cron request
export default async function(req, res) {
  if (req.method === "POST") {
    console.log(req.body.accountId);
    console.log(req.body.cid);

    const encryptedData = await fetch(`${process.env.PINATA_GATEWAY}${req.body.cid}`)
    const json = await encryptedData.json();

    const decryptedData = decrypt(json.value);

    const { privateKey, token } = JSON.parse(decryptedData);

    const wallet = new ethers.Wallet(privateKey, provider);

    let owner = wallet.address;

    //Call the method to get the nfts owned by this address
    let response = await alchemy.nft.getNftsForOwner(owner)

    //Logging the response to the console
    const agentNft = response.ownedNfts[0]
    const agentTokenId = agentNft.tokenId

    const { tokenUri } = agentNft;

    const metadata = await fetch(tokenUri.raw);
    const metadataJson = await metadata.json();

    //  We need to get info about the agent
    console.log(metadataJson);

    //  @TODO STEVE get ship and contract NFTs owned by agent TBA

    const serverWallet = new ethers.Wallet(process.env.SERVER_WALLET_PRIVATE_KEY, provider);
    const tokenboundClient = new TokenboundClient({ signer: serverWallet, chainId: 80001 })
    const agentTBA = await tokenboundClient.getAccount({
      tokenContract: process.env.CONTRACT_ADDRESS,
      tokenId: agentTokenId
    });

    const tbaNfts = await alchemy.nft.getNftsForOwner(agentTBA)
    const tbaNftsList = tbaNfts.ownedNfts;

    let shipNft = null;
    let contractNft = null;

    tbaNftsList.forEach(item => {
      if (item.title.startsWith('ship:')) {
        shipNft = item
        return shipNft
      } else if (item.title.startsWith('Contract:')) {
        contractNft = item
        return contractNft
      }
    })

    //  @TODO STEVE get contract NFT metadata

    const contractMetadataRaw = await fetch(contractNft.tokenUri.raw);
    const contractMetadataJson = await contractMetadataRaw.json();
    const contractData = contractMetadataJson.data

    console.log(contractData);


    //  We need to inform AI of our agent's current situation (summarize?)

    //  We need to inform AI of the game options and restrictions
    //  We need AI to act
  } else {
    //  GET ALL Agent IDs from DB and loop through making rapid API calls to serverless function
    let hasMore = true;
    let pageOffset = 0;

    let allFiles = [];

    while (hasMore) {
      try {

        const filter = {
          metadata: {
            keyvalues: {
              starshipAccounts: {
                value: 'true',
                op: 'eq'
              }
            }
          },
          status: 'pinned',
          pageLimit: 100,
          pageOffset
        }
        console.log(filter)
        const files = await pinata.pinList(filter);
        console.log(files.rows.length);
        allFiles = [...allFiles, ...files.rows];
        pageOffset = pageOffset + 100;
        if (files.rows.length === 0) {
          hasMore = false
        }

        res.json(allFiles);
      } catch (error) {
        console.log("Error in the while loop")
        console.log(error);
        throw error;
      }
    }

    console.log({ allFiles });

    allFiles.forEach(file => {
      fetch(`${FULL_URL}/actions`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          accountId: file.metadata.keyvalues.accountId,
          cid: file.ipfs_pin_hash
        })
      })
    })
  }
}
