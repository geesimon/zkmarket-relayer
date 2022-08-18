const express = require('express')
const cors = require('cors');
const { ethers } = require("ethers");
require('dotenv').config()

const fs = require('fs');
const PaypalUSDCAssetPoolAbi = JSON.parse(fs.readFileSync('paypal/PaypalUSDCAssetPool.json')).abi;

const {
      CHAIN_URL, 
      OPERATOR_PRIVATE_KEY, 
      RELAYER_PRIVATE_KEY,
      PAYPAL_USDC_ASSET_POOL_ADDRESS} = process.env;
const EtherProvider = new ethers.providers.JsonRpcProvider(CHAIN_URL);
const OperatorWallet = new ethers.Wallet(OPERATOR_PRIVATE_KEY, EtherProvider); 
const RelayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, EtherProvider);

const toFixedHex = (number, length = 32) => '0x' + ethers.BigNumber.from(number).toHexString().slice(2).padStart(length * 2, '0');


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

app.post('/api/registerCommitment', async (req, res, next) => {
    const t_start = new Date();

    const {amount, description} = req.body;

    if (typeof(amount) === 'string' && typeof(description) === 'string'){
        const commitmentHash = toFixedHex(description.match(/[0-9]+/g)[0]);
        const paypalUSDCAssetPool = new ethers.Contract(
                                                        PAYPAL_USDC_ASSET_POOL_ADDRESS, 
                                                        PaypalUSDCAssetPoolAbi, 
                                                        OperatorWallet
                                                        );
    
        try {
            await paypalUSDCAssetPool.registerCommitment(toFixedHex(commitmentHash), amount.toString());


            res.send(error(0, "OK"));
        } catch(e){
            next(error(102, e))
        }
    } else {
        next(error(101, "Bad Request"))
    }    
    
    const t_end = new Date();
    console.log('Seconds Elapsed (registerCommitment):', (t_end - t_start) / 1000);
  }
)

app.post('/api/proveCommitment', async (req, res, next) => {
    const t_start = new Date();

    const {proofData, publicSignals} = req.body;

    if (typeof(proofData) === 'object' && typeof(publicSignals) === 'object') {
        const paypalUSDCAssetPool = new ethers.Contract(
                                                        PAYPAL_USDC_ASSET_POOL_ADDRESS, 
                                                        PaypalUSDCAssetPoolAbi, 
                                                        RelayerWallet
                                                        );
        try {
            const tx = await paypalUSDCAssetPool.proveCommitment(proofData, publicSignals);
            const {events} = await tx.wait();
            
            const resp = JSON.stringify({
                                        root: events[0].args.root,
                                        pathElements: events[0].args.pathElements,
                                        pathIndices: events[0].args.pathIndices
                                        })
            res.send(resp);
        } catch(e) {
            next(error(202, e))
        }
    } else {
        next(error(201, "Bad Request"))
    } 

    const t_end = new Date();
    console.log('Seconds Elapsed (proveCommitment):', (t_end - t_start) / 1000);
})

app.post('/api/withdraw', async (req, res, next) => {
    const t_start = new Date();

    const {proofData, publicSignals} = req.body;
    if (typeof(proofData) === 'object' && typeof(publicSignals) === 'object') {
        const paypalUSDCAssetPool = new ethers.Contract(
                                                        PAYPAL_USDC_ASSET_POOL_ADDRESS, 
                                                        PaypalUSDCAssetPoolAbi, 
                                                        RelayerWallet
                                                        );
        try {
            const tx = await paypalUSDCAssetPool.withdraw(proofData, publicSignals);
            const {events} = await tx.wait();
            
            if (events[0].event === 'Withdrawal') {
                res.send(error(0, "OK"));
            } else {
                next(error(303, "Bad Contract Response"))
            }
        } catch(e) {
            next(error(302, e))
        }
    } else {
        next(error(301, "Bad Request"))
    } 

    const t_end = new Date();
    console.log('Seconds Elapsed (withdraw):', (t_end - t_start) / 1000);
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