const pinataSDK = require('@pinata/sdk');
const pinata = new pinataSDK(process.env.PINATA_KEY, process.env.PINATA_SECRET);
const FULL_URL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000/api/'


//  @TODO create a secret that is passed in from cron request
export default async function (req, res) {
  if(req.method === "POST") {
    console.log(req.body.accountId);
    console.log(req.body.cid);

    const json = await fetch(`http://starship_syndicate.mypinata.cloud/ipfs/${req.body.cid}`)
    console.log(json);
    //  We need to get info about the agent
    //  We need to inform AI of our agent's current situation (summarize?)
    //  We need to inform AI of the game options and restrictions
    //  We need AI to act
  } else {
    //  GET ALL Agent IDs from DB and loop through making rapid API calls to serverless function
    let hasMore = true;
    let pageOffset = 0;

    let allFiles = [];
    
    while(hasMore) {
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
          pageLimit: 100, 
          pageOffset
        }
        console.log(filter)
        const files = await pinata.pinList(filter);
        console.log(files.rows.length);
        allFiles = [...allFiles, ...files.rows];
        pageOffset = pageOffset + 100;
        if(files.rows.length === 0) {
          hasMore = false
        } 

        res.json(allFiles);
      } catch (error) {
        console.log("Error in the while loop")
        console.log(error);
        throw error;
      }      
    }  
    
    console.log({allFiles});

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