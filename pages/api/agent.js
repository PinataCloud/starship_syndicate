import { factions } from "../../factions";
import OpenAI from "openai";
const pinataSDK = require('@pinata/sdk');
const pinata = new pinataSDK(process.env.PINATA_KEY, process.env.PINATA_SECRET);

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY,
});

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
      //  @TODO JUSTIN map agent, wallet, and token and add to DB

      delete data.token;

      const agentMetadata = {
        name: opts.symbol, 
        description: `Space cowboy in the ${opts.faction} faction`, 
        faction: data.faction,
        data: data.agent
      }

      const { IpfsHash: agentHash } = await pinata.pinJSONToIPFS(agentMetadata, {pinataMetadata: {name: data.agent.symbol, keyvalues: {'accountId': data.agent.accountId}}})
      console.log({agentHash});

      const shipMetadata = {
        name: data.ship.symbol, 
        data: data.ship
      }

      const { IpfsHash: shipHash } = await pinata.pinJSONToIPFS(shipMetadata, {pinataMetadata: {name: data.ship.symbol, keyvalues: {'shipAccountId': data.agent.accountId}}})
      console.log({shipHash});

      const contractMetadata = {
        name: `${data.contract.id}`, 
        description: `${data.contract.type} Contract`
      }

      const { IpfsHash: contractHash } = await pinata.pinJSONToIPFS(contractMetadata, {pinataMetadata: {name: data.contract.id, keyvalues: {'contractAccountId': data.agent.accountId}}})
      console.log({contractHash});

      //  @TODO STEVE

      //  Mint Agent NFT from Agent Wallet
      //  Create TBA from Agent NFT

      //  Mint Ship NFT into Agent TBA

      //  Mint Contract NFT into Agent TBA

      res.json(data);
      // //  Write to IPFS using Pinata (metadata should represent accountID)
      
    } catch (error) {
      console.log(error);
      return res.status(500).send("Server error");
    }
  }
}
