const { BlobServiceClient } = require("@azure/storage-blob");
const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");
const axios = require("axios");
const crypto = require("crypto");

const account = process.env.AZURE_ACCOUNT_NAME;
const accountkey = process.env.AZURE_ACCOUNT_KEY;
const containerName = process.env.AZURE_BLOB_CONTAINER_NAME;
const tablename = process.env.AZURE_TABLE_NAME;

const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const credential = new AzureNamedKeyCredential(account, accountkey);
const tableClient = new TableClient(
   '', // Add your table.core.windows.net storage reference here
   tablename,
   credential
);

module.exports = async function (context, timer) {
   try {
       context.log("Azure Function triggered...");

       const containerClient = blobServiceClient.getContainerClient(containerName);
       await containerClient.createIfNotExists();
       await tableClient.createTable();
       context.log("Table Built");

       const githubFiles = []; // Array for storing the URLs from storage
       for await (const entity of tableClient.listEntities({	// Fetch me their souls.... Or in this case the raw URLs where the readme files exist
           queryOptions: { filter: `PartitionKey eq ''` } // Set the PartitionKey to whatever it is in your storage blob where you're holding the raw github URLs
       })) {
           if (entity.SourceURL) {
               githubFiles.push(entity.SourceURL); // LOOOOOOOPPPPPPPPPPPPPPPPPPPPP
           }
       }

       for (const file of githubFiles) {
           const fileName = decodeURIComponent(file.split("/").slice(-2)); // Get name of log source and remove that horrible html
           const blobName = `files/${fileName}`; // Give it a name
           context.log(`Processing file: ${fileName}`);

           let response; // Go grab the webpage from github
           try {
               response = await axios.get(file, { responseType: "arraybuffer" });
           } catch (error) {
               context.log.error(`Failed to fetch file from GitHub: ${file}`);
               continue;
           }

           const fileBuffer = Buffer.from(response.data);

           const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex"); // Hash it
           context.log(`Calculated hash for ${fileName}: ${hash}`);

           const blobClient = containerClient.getBlockBlobClient(blobName); // Send it to storage
           await blobClient.uploadData(fileBuffer, { overwrite: true });
           context.log(`File ${fileName} uploaded to Blob Storage.`); 

           const partitionKey = ""; // Set this equal to the PartitionKey in the table where you're holding the filehashes
           const rowKey = fileName; // Set name
           try {
               const existingEntity = await tableClient.getEntity(partitionKey, rowKey);
               if (existingEntity.Hash === hash) { // Compare hashes of old web page vs new
                   context.log(`No changes detected for file: ${fileName}`);
                   continue;
               }
               context.log(`File ${fileName} has changed. Updating hash...`);
           } catch (error) {
               if (error.statusCode !== 404) {
                   context.log.error(`Error retrieving hash for ${fileName}: ${error.message}`);
                   continue;
               }
               context.log(`Hash for file ${fileName} not found in Table Storage. Adding new entry...`);
           }

           await tableClient.upsertEntity({ // Add/Update hash value
               partitionKey,
               rowKey,
               Hash: hash,
               LastUpdated: new Date().toISOString(),
               FileUrl: file
           });

           context.log(`Hash for file ${fileName} updated in Table Storage.`);
       }
   } catch (error) {
       context.log.error("Error in Azure Function:", error.message);
   }
};
