const express = require('express')
const cors = require('cors');
const { ethers } = require("ethers");
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

require('dotenv').config()

const fs = require('fs');
const PaypalUSDCAssetPoolAbi = JSON.parse(fs.readFileSync('paypal/PaypalUSDCAssetPool.json')).abi;

const { CHAIN_URL, 
        OPERATOR_PRIVATE_KEY, 
        RELAYER_PRIVATE_KEY,
        PAYPAL_USDC_ASSET_POOL_ADDRESS,
        PORT, 
        PAYPAL_AUTH_URL,
        PAYPAL_PAYOUT_URL,
        PAYPAL_CLIENT_ID,
        PAYPAL_SECRET } = process.env;
const EtherProvider = new ethers.providers.JsonRpcProvider(CHAIN_URL);
const OperatorWallet = new ethers.Wallet(OPERATOR_PRIVATE_KEY, EtherProvider); 
const RelayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, EtherProvider);

const toFixedHex = (number, length = 32) => '0x' + ethers.BigNumber.from(number).toHexString().slice(2).padStart(length * 2, '0');

const app = express();

const error = (_code, _msg) => {
    var err = new Error(_msg);
    err.code = _code;

    return err;
}

let lastBlockNumber = 1978;
let paypalAccessTokenCache = {
    access_token: '',
    expires: 0
};

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
            const tx = await paypalUSDCAssetPool.registerCommitment(toFixedHex(commitmentHash), amount.toString());
            const receipt = await tx.wait();
            console.log(receipt);

            res.send(error(0, "OK"));
        } catch(e){
            console.log(e);
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
            
            if (events[events.length - 1].event === 'Withdrawal') {
                res.send(error(0, "OK"));
            } else {
                next(error(303, "Bad Contract Response"))
            }
        } catch(e) {
            console.log(e);
            next(error(302, e))
        }
    } else {
        next(error(301, "Bad Request"))
    } 

    const t_end = new Date();
    console.log('Seconds Elapsed (withdraw):', (t_end - t_start) / 1000);
})

const getPaypalAccessToken = async () => {
    const currentTime =  Math.round(Date.now() / 1000);
    if (currentTime - paypalAccessTokenCache.expires > 1000) { //Consider expired
        const clientIdAndSecret = PAYPAL_CLIENT_ID + ":" + PAYPAL_SECRET;
        const base64Auth = Buffer.from(clientIdAndSecret).toString('base64');
    
        const resp = await fetch(PAYPAL_AUTH_URL, 
                                    {
                                        method: 'POST',
                                        headers: {
                                            'content-type': 'application/x-www-form-urlencoded',
                                            'Accept': 'application/json',
                                            'Accept-Language': 'en_US',
                                            'Authorization': `Basic ${base64Auth}`,
                                        },
                                        body: 'grant_type=client_credentials'
                                    })
        const {access_token, expires_in} = await resp.json();
        paypalAccessTokenCache.access_token = access_token;
        paypalAccessTokenCache.expires =  Math.round(Date.now() / 1000) + expires_in;

        console.log(paypalAccessTokenCache)
    }
    return paypalAccessTokenCache.access_token;
}

const paypalPayouts = async (_payments) =>{
    const accessToken = await getPaypalAccessToken();
    const bearer = 'Bearer ' + accessToken;
    let payoutInstructions = {
        'sender_batch_header': {
            'sender_batch_id': `Payouts_${Date.now()}`,
            'email_subject': 'You have a payout from zkMarket Finance!',
            'email_message': 'Thanks for using zkMarket Finance!'
        },
        'items': []
    }

    for (const account in _payments) {
        payoutInstructions.items.push({
            'recipient_type': 'EMAIL',
            'amount': {
                'value': (Number(_payments[account].div(10 ** 4)) / 100).toString(),
                'currency': 'USD'
            },
            'note': 'For selling coins!',
            'receiver': account,
            'notification_language': 'en-US'
        })
    }
    console.log(JSON.stringify(payoutInstructions));

    try {
        const resp = await fetch(PAYPAL_PAYOUT_URL, 
            {
                method: 'POST',
                headers: {
                    'Authorization': bearer,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payoutInstructions)
            });

        const respJson = await resp.json();
        console.log(respJson);
    } catch (e) {
        console.log(e);
        return false;
    }

    return true;
}

app.get('/auth', async (req, res, next) => {
    const accessToken = await getPaypalAccessToken();

    res.send({code:0, accessToken});
})

app.get('/payouts', async (req, res, next) => {
    const currentBlockNumber = await EtherProvider.getBlockNumber();
    const payments = {};

    console.log('Current Block Number:', currentBlockNumber);
    if (currentBlockNumber > lastBlockNumber) {
        const paypalUSDCAssetPool = new ethers.Contract(
            PAYPAL_USDC_ASSET_POOL_ADDRESS, 
            PaypalUSDCAssetPoolAbi, 
            OperatorWallet
        );
        const filter = paypalUSDCAssetPool.filters.SellerPayouts();        
        
        const events = await paypalUSDCAssetPool.queryFilter(filter, lastBlockNumber, currentBlockNumber);
        console.log(events);
        if (events.length > 0) {
            events.forEach(event =>{
                console.log(event.args);
                const account = event.args.paypalAccount;
                const amount = ethers.BigNumber.from(events[0].args.amount.toString());
    
                if (payments.hasOwnProperty(account)){
                    payments[account] = payments[account].add(amount);
                } else {
                    payments[account] = amount;
                }
            })
    
            if (await paypalPayouts(payments)){
                lastBlockNumber = currentBlockNumber;
        
                res.send({code:0, msg: 0});
            } else {
                next(error(401, "Failed to request payout"));
            }
        }
    } else {
        res.send({code:0, msg: 0})
    }    
})

app.get('/test', async (req, res, next) => {
    console.log(PAYPAL_USDC_ASSET_POOL_ADDRESS);
    const paypalUSDCAssetPool = new ethers.Contract(
        PAYPAL_USDC_ASSET_POOL_ADDRESS, 
        PaypalUSDCAssetPoolAbi, 
        OperatorWallet
    );

    const tx = await paypalUSDCAssetPool.registerCommitment(toFixedHex('1234'), '123');
    const resp = await tx.wait();
    console.log(resp);
   
    res.send({code:0, msg: 0});
    
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