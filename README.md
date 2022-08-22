# zkMarket-Relayer

zkMarket.Finance is a P2P crypto coin marketplace where anyone can trade using traditional payment method (PayPal) privately.

## Local Setup

1. `cp .env.example .env` and change the parameters accordingly 
1. `npm  install`
1. `npm start`

Note: please also update zkMarket-UI to point to the URL of this relayer

## Function/Serverless Implementation

To avoid maintaining dedicate servers, the relayer is also implemented as FaaS and deployed ` ali-fc` (Alibaba Cloud Function Compute).
