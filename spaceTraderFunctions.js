import { TokenboundClient } from "@tokenbound/sdk";
const pinataSDK = require('@pinata/sdk');
const pinata = new pinataSDK(process.env.PINATA_KEY, process.env.PINATA_SECRET);
const ethers = require('ethers');

export const acceptContract = async (token, contractId) => {
  try {
    console.log("ACCEPTING CONTRACT....");
    const url = `https://api.spacetraders.io/v2/my/contracts/${contractId}/accept`;
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    };
    const response = await fetch(url, options);
    const {data} = await response.json();
    console.log("Accepted contract: ", data);
    //  Upload contract metadata to IPFS
    const contractMetadata = {
      name: `Contract: ${data.contract.id}`,
      description: `${data.contract.type} Contract`,
      data: data,
      image: "ipfs://Qmeat5p4PzYtNYtV7TPXf64V3T6imayG8i3eALcVjGFR6S"
    }

    console.log("Uploading contract NFT metadata to IPFS...");
    const { IpfsHash: contractHash } = await pinata.pinJSONToIPFS(contractMetadata, { pinataMetadata: { name: data.contract.id, keyvalues: { 'contractAccountId': data.agent.accountId } } })
    console.log({ contractMetadata });

    return contractHash;
  } catch (error) {
    console.log(error);
    throw error;
  }
};

export const scanWaypoints = async (token, shipSymbol) => {
  console.log("SCANNING WAYPOINTS...");
  const url = `https://api.spacetraders.io/v2/my/ships/${shipSymbol}/scan/waypoints`;
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  };

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    console.log(data);
    console.log("Waypoints , data");
  } catch (error) {
    console.error(error);
  }
};

export const purchaseShip = async (token, waypoint) => {
  console.log("PURCHASING SHIP...");
  const url = "https://api.spacetraders.io/v2/my/ships";
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: `{"shipType":"SHIP_PROBE","waypointSymbol":${waypoint}`,
  };

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    console.log(data);
    console.log("Ship purchased: ", data);
    return data;
  } catch (error) {
    console.error(error);
  }
};

export const orbitShip = async (token, shipSymbol) => {
  const url = `https://api.spacetraders.io/v2/my/ships/${shipSymbol}/orbit`;
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  };

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    console.log(data);
    return data;
  } catch (error) {
    console.error(error);
  }
};
