import { MCC, UtxoBlock, UtxoMccCreate, UtxoTransaction } from "@flarenetwork/mcc";

const fs = require("fs");

const mccConection = {
  url: "https://bitcoin-api.flare.network",
  username: "public",
  password: "d681co1pe2l3wcj9adrm2orlk0j5r5gr3wghgxt58tvge594co0k1ciljxq9glei",
} as UtxoMccCreate;

let mccClient = new MCC.BTC(mccConection);

describe(" ", () => {
  it(" nekej", async () => {
    const blockhash = "0000000000000000000163416b1eb2d2a4c0e4636a6681806528c89e52778106";
    const txId = "7b8839cc825219ad483da800be0237692a6aa2f6e4b59721a31915980b712079";
    let resblock = await mccClient.client.post("", {
      jsonrpc: "1.0",
      id: "rpc",
      method: "getblock",
      params: [blockhash, 2],
    });
    let restx = await mccClient.client.post("", {
      jsonrpc: "1.0",
      id: "rpc",
      method: "getrawtransaction",
      params: [txId, true],
    });
    // console.log(restx.data);

    fs.writeFile("test/mockData/BTCBlockAlt.json", JSON.stringify(resblock.data.result), () => {});
    fs.writeFile("test/mockData/BTCTxAlt.json", JSON.stringify(restx.data.result), () => {});
  });
});
