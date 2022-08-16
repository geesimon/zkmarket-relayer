const fetch = require('node-fetch');

let IPNValidatorURL;

exports.initializer = (context, callback) => {
    IPNValidatorURL = process.env.IPN_VALIDATOR_URL;

    callback(null, '');
};

exports.handler = async (req, resp, context) => {
    let reqBody = req.body.toString();

    const response = await fetch(IPNValidatorURL, {method: 'POST', 
                                                    body: 'cmd=_notify-validate&'　+　reqBody});

    const responseCode = await response.text();

    if ('VERIFIED' === responseCode){
        const reqParams = new URLSearchParams(reqBody);

        console.log('transaction_id:', reqParams.get('txn_id'));
        console.log('paid from:', reqParams.get('payer_email'), '<==>', reqParams.get('payer_id'));
        console.log('item_name:',  reqParams.get('item_name'));
        console.log('Amount:', Number(reqParams.get('mc_gross')) - Number(reqParams.get('mc_fee')));
        console.log('---------------------------------------')
        console.log(reqParams);
    } else {
        console.log(reqBody);
        console.log("BAD REQUEST");
    }

    resp.setStatusCode(200);
    resp.setHeader("Content-Type", "text/plain");
    resp.send('OK');
}