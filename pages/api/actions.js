const pinataSDK = require('@pinata/sdk');
const pinata = new pinataSDK(process.env.PINATA_KEY, process.env.PINATA_SECRET);
const FULL_URL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000/api/'

export default async function () {
  if(method === "POST") {
    console.log(req.body.accountId);
    console.log(cid);
  } else {
    //  GET ALL Agent IDs from DB and loop through making rapid API calls to serverless function
    let hasMore = true;
    let pageOffset = 0;

    const allFiles = [];

    const filter = {
      metadata: {
        keyvalues: {
          starshipAccounts: {
              value: 'true',
              op: 'eq'
          }
        }, 
        pageLimit: 100, 
        pageOffset
      }
    }

    while(hasMore) {
      const files = await pinata.pinList(filter);
      allFiles.concat(files);
      pageOffset = pageOffset + 100;
      if(files.length === 0) {
        hasMore = false
      }
    }  
    
    files.forEach(file => {
      fetch(`${FULL_URL}/actions`, {
        method: "POST", 
        headers: {
          'Content-Type': 'application/json'
        }, 
        body: JSON.stringify({
          accountId: file.metadata.accountId, 
          cid: file.ipfs_pin_has
        })
      })
    })
  }
}