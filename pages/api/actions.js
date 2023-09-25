import { decrypt } from "@/components/encryption";
import OpenAI from "openai";
import { TokenboundClient } from "@tokenbound/sdk";
import {
  acceptContract,
  orbitShip,
  purchaseShip,
  scanWaypoints,
} from "@/components/spaceTraderFunctions";

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY,
});

const pinataSDK = require("@pinata/sdk");
const pinata = new pinataSDK(process.env.PINATA_KEY, process.env.PINATA_SECRET);
const FULL_URL =
  process.env.NODE_ENV === "production" ? "" : "http://localhost:3000/api/";
const ethers = require("ethers");
const provider = new ethers.AlchemyProvider(
  "maticmum",
  process.env.ALCHEMY_API_KEY
);

const { Alchemy, Network } = require("alchemy-sdk");

// Configures the Alchemy SDK
const config = {
  apiKey: process.env.ALCHEMY_API_KEY,
  network: Network.MATIC_MUMBAI, // Replace with your network
};

// Creates an Alchemy object instance with the config to use for making requests
const alchemy = new Alchemy(config);

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

const actionFunctions = async (messages) => {
  const actionResponse = await openai.chat.completions.create({
    messages: messages,
    functions: [
      {
        name: "accept_contract",
        description: "Accept the pending contract for the agent",
        parameters: {
          type: "object",
          properties: {
            token: {
              type: "string",
              description: "the token for authenticating the request",
            },
            contractId: {
              type: "string",
              description: "The contract identifier",
            },
          },
          required: ["token"],
        },
      },
      /* {
        name: "scan_waypoints",
        description: "Scan waypoints near the ship's current location",
        parameters: {
          type: "object",
          properties: {
            token: {
              type: "string",
              description: "the token for authenticating the request",
            },
            shipSymbol: {
              type: "string",
              description: "The ship's call sign/symbol",
            }
          },
          required: ["token"],
        },
      }, */
      /* {
        name: "purchase_ship",
        description: "Purchases a ship at a given waypoint",
        parameters: {
          type: "object",
          properties: {
            token: {
              type: "string",
              description: "the token for authenticating the request",
            },
            waypoint: {
              type: "string",
              description:
                "The waypoint location for the ship to be purchased",
            },
          },
          required: ["token"],
        },
      }, */
      {
        name: "orbit_ship",
        description: "Send ship into orbit.",
        parameters: {
          type: "object",
          properties: {
            token: {
              type: "string",
              description: "the token for authenticating the request",
            },
            shipSymbol: {
              type: "string",
              description: "The ship's call sign/symbol",
            },
          },
          required: ["token"],
        },
      },
    ],
    model: "gpt-3.5-turbo",
    temperature: 1,
    function_call: "auto",
  });
  return actionResponse;
};

//  @TODO create a secret that is passed in from cron request
export default async function (req, res) {
  if (req.method === "POST") {
    console.log({ accountId: req.body.accountId });
    console.log({ CID: req.body.cid });

    const encryptedData = await fetch(
      `${process.env.PINATA_GATEWAY}${req.body.cid}`
    );
    const json = await encryptedData.json();

    const decryptedData = decrypt(json.value);

    const { privateKey, token } = JSON.parse(decryptedData);

    const wallet = new ethers.Wallet(privateKey, provider);

    let owner = wallet.address;

    //Call the method to get the nfts owned by this address
    let response = await alchemy.nft.getNftsForOwner(owner);

    //Logging the response to the console
    const agentNft = response.ownedNfts[0];
    const agentTokenId = agentNft.tokenId;

    const { tokenUri } = agentNft;

    const metadata = await fetch(tokenUri.raw);
    const metadataJson = await metadata.json();

    //  We need to get info about the agent
    console.log({ agentMetadata: metadataJson });

    const serverWallet = new ethers.Wallet(
      process.env.SERVER_WALLET_PRIVATE_KEY,
      provider
    );
    const tokenboundClient = new TokenboundClient({
      signer: serverWallet,
      chainId: 80001,
    });
    const agentTBA = await tokenboundClient.getAccount({
      tokenContract: process.env.CONTRACT_ADDRESS,
      tokenId: agentTokenId,
    });

    const tbaNfts = await alchemy.nft.getNftsForOwner(agentTBA);
    const tbaNftsList = tbaNfts.ownedNfts;

    let shipNft = null;
    let contractNft = null;

    tbaNftsList.forEach((item) => {
      if (item.title.startsWith("ship:")) {
        shipNft = item;
        return shipNft;
      } else if (item.title.startsWith("Contract:")) {
        contractNft = item;
        return contractNft;
      }
    });

    
    const contractMetadataRaw = await fetch(contractNft.tokenUri.raw);
    const contractMetadataJson = await contractMetadataRaw.json();
    const contractData = contractMetadataJson.data;

    console.log({ contractData });

    const shipMetadataRaw = await fetch(shipNft.tokenUri.raw);
    const shiptMetadataJson = await shipMetadataRaw.json();
    const shipData = shiptMetadataJson.data;

    console.log({ shipData });

    //  We need to inform AI of our agent's current situation (summarize?)
    const aiReponse = await openai.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `You are a JSON parsing wizard. We are playing a game where you act as the NPC space cowboy agent. I am providing you with the JSON data about the agent, JSON data about the agent's ship, and JSON data about the agent's current contract. Summarize the NPC agent's current situation in the form of a short paragraph of prose based on the following JSON.\n
          Agent JSON: ${JSON.stringify(metadataJson)}\n
          Ship JSON: ${JSON.stringify(shipData)}\n
          Contract JSON: ${JSON.stringify(shipData)}
          `,
        },
      ],
      model: "gpt-3.5-turbo",
      temperature: 0.8,
    });

    const { choices } = aiReponse;
    console.log(choices[0]);

    const summary = choices[0].message.content;

    const messages = [
      {
        role: "user",
        content: `You are a space cowboy, referred to as an agent in the game. This is a summary of your current situation. You must execute the next action as the agent by calling either accept_contract or orbit_ship`,
      },
    ];

    let actionResponse = await actionFunctions(messages);
    let responseMessage = actionResponse.choices[0].message;
    console.log("Initial try at function call...");
    console.log({ responseMessage });

    let retries = 0;

    while (!responseMessage.function_call && retries < 5) {
      console.log("Looping until we have a good response with a function call...");
      actionResponse = await actionFunctions(messages);
      responseMessage = actionResponse.choices[0].message;
      retries++;
    }

      if (responseMessage.function_call) {
        const availableFunctions = {
          accept_contract: acceptContract,
          // scan_waypoints: scanWaypoints,
          // purchase_ship: purchaseShip,
          orbit_ship: orbitShip,
        }; 
        const functionName = responseMessage.function_call.name;
        const functionToCall = availableFunctions[functionName];
        // const functionArgs = JSON.parse(responseMessage.function_call.arguments);
        const secondArg =
          functionName === "scan_waypoints" || functionName === "orbit_ship"
            ? shipData.symbol
            : functionName === "accept_contract"
            ? contractData.id
            : "";
        const functionResponse = await functionToCall(token, secondArg);
        console.log("Response from function call: ");
        console.log(functionResponse);

        //  Reconstruct Wallet
        const serverWallet = new ethers.Wallet(process.env.SERVER_WALLET_PRIVATE_KEY, provider);

        const tokenboundClient = new TokenboundClient({ signer: serverWallet, chainId: 80001 })

        console.log("burning contract NFT...");
        //  Burn existing Contract NFT
        //  @TODO how the heck to we do this is the NPC wallet has no funds?
        //  @TODO maybe we transfer funds from server wallet?
        

        //  Mint new contract NFT 
        console.log("Minting new contract nft")
        mintNft(contractHash, agentTBA);

        console.log("Minted new Contract NFT");


      } else {
        console.log("No function called");
        return;
      }

    res.send("Done");
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
                value: "true",
                op: "eq",
              },
            },
          },
          status: "pinned",
          pageLimit: 100,
          pageOffset,
        };
        console.log(filter);
        const files = await pinata.pinList(filter);
        console.log(files.rows.length);
        allFiles = [...allFiles, ...files.rows];
        pageOffset = pageOffset + 100;
        if (files.rows.length === 0) {
          hasMore = false;
        }

        res.json(allFiles);
      } catch (error) {
        console.log("Error in the while loop");
        console.log(error);
        throw error;
      }
    }

    console.log({ allFiles });

    const file = allFiles[0];
    await fetch(`${FULL_URL}/actions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        accountId: file.metadata.keyvalues.accountId,
        cid: file.ipfs_pin_hash,
      }),
    });
    // allFiles.forEach(file => {
    // fetch(`${FULL_URL}/actions`, {
    //   method: "POST",
    //   headers: {
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify({
    //     accountId: file.metadata.keyvalues.accountId,
    //     cid: file.ipfs_pin_hash
    //   })
    // })
    // })
  }
}
