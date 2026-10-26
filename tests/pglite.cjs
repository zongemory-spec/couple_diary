const {pathToFileURL}=require('node:url');
module.exports=async()=>{try{return require('@electric-sql/pglite')}catch(e){if(process.env.PGLITE_PATH)return import(pathToFileURL(process.env.PGLITE_PATH));throw new Error('Run npm install before npm test; @electric-sql/pglite is a dev dependency.')}};
