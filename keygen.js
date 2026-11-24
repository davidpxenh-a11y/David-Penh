// Run ONCE on YOUR computer: node keygen.js
// Creates license-private.pem (keep secret, only on your vendor machine) and license-public.pem (ship to customers).
const crypto=require('crypto'),fs=require('fs');
if(fs.existsSync('license-private.pem')){console.log('license-private.pem already exists. Delete it first if you really want new keys (old licenses will stop working).');process.exit(1)}
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
fs.writeFileSync('license-private.pem',privateKey.export({type:'pkcs8',format:'pem'}));
fs.writeFileSync('license-public.pem',publicKey.export({type:'spki',format:'pem'}));
console.log('Created license-private.pem (SECRET) and license-public.pem (give to customers).');
