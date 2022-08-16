const express = require('express')
const cors = require('cors');
const { ethers } = require("ethers");
require('dotenv').config()

const fs = require('fs');

const {CHAIN_URL, RELAYER_PRIVATE_KEY} = process.env;
const EtherProvider = new ethers.providers.JsonRpcProvider(CHAIN_URL);
const RelayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, EtherProvider);

let RelayerAddress;

// RelayerWallet.getAddress().then(_addr => {
//   RelayerAddress = ethers.BigNumber.from(_addr).toString();
// })

const app = express();
const {PORT} = process.env;

const error = (_code, _msg) => {
    var err = new Error(_msg);
    err.code = _code;

    return err;
}

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Welcome to zkMarket Finance :)')
})

app.get('/address', async (req, res) => {
  res.send(RelayerAddress);
})

app.post('/api/relay', async (req, res, next) => {
})

app.use(function(err, req, res, next){
    res.status(500);
    res.send({ code: err.code, error: err.message });
  });

app.use(function(req, res){
    res.status(404);
    res.send({ code: 404, error: "Sorry, can't find that" })
});

app.listen(PORT, () => {
  console.log(`Relayer listening on port ${PORT}`)
})