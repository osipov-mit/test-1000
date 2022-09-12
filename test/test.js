const { decodeAddress, GearApi, GearKeyring } = require('@gear-js/api');
const { readdirSync, readFileSync } = require('fs');
const path = require('path');

async function batchUploads(api, paths) {
  const alice = await GearKeyring.fromSuri('//Alice');
  const codes = paths.map((path) => readFileSync(path));
  const txs = codes.map((code) => api.program.upload({ code, gasLimit: 0, initPayload: '0x', value: 0 }));
  return new Promise((resolve, reject) => {
    api.tx.utility.batchAll(txs.map(({ extrinsic }) => extrinsic)).signAndSend(alice, ({ events }) => {
      events.forEach(({ event }) => {
        if (event.method === 'ExtrinsicFailed') {
          reject(`ExtrinsicFailed`);
        }
        if (event.method === 'BatchCompleted') {
          resolve(txs.map(({ programId }) => programId));
        }
      });
    });
  });
}

function listenToUserMessageSent(api, programId) {
  return new Promise((resolve) =>
    api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data }) => {
      if (data.message.source.eq(programId)) {
        resolve(data.toHuman());
      }
    }),
  );
}

const main = async () => {
  const dir = readdirSync(path.resolve(__dirname, '../test_programs')).map((name) =>
    path.resolve(__dirname, '../test_programs', name),
  );
  const api = await GearApi.create();
  const alice = await GearKeyring.fromSuri('//Alice');
  const programIds = [];
  for (let i = 0; i < 8; i += 1) {
    programIds.push(...(await batchUploads(api, dir.slice(i * 25, i * 25 + 25))));
  }
  const code = readFileSync(
    '/Users/dmitriiosipov/gear/test/1000-messages/target/wasm32-unknown-unknown/release/test_1000.opt.wasm',
  );
  const payload = api.createType('Vec<[u8;32]>', programIds).toHex();
  let gas = await api.program.calculateGas.initUpload(decodeAddress(alice.address), code, payload, 0, true);
  const { programId } = api.program.upload({ code, initPayload: payload, gasLimit: gas.min_limit });
  console.log(programId);
  await new Promise((resolve, reject) =>
    api.program.signAndSend(alice, ({ events, status }) =>
      events.forEach(({ event: { method } }) => {
        if (method === 'ExtrinsicSuccess' && status.isFinalized) {
          resolve(method);
        } else if (method === 'ExtrinsicFailed') {
          reject(method);
        }
      }),
    ),
  );
  // const programId = '0x81dc1f46f6fa45f8740301e4dbf870c70345038e49f0fcb3313fd86b484b2b5b';

  // console.log(BigInt('427317954000') % api.blockGasLimit.toBigInt());
  //250000000000n
  // console.log(177317954000n + api.blockGasLimit.toBigInt());

  // gas = await api.program.calculateGas.handle(decodeAddress(alice.address), programId, '0x', 0, false);
  // console.log(gas.toHuman());
  api.message.send({ destination: programId, payload: '0x', gasLimit: api.blockGasLimit.muln(10) });
  const reply = listenToUserMessageSent(api, programId);
  // console.time('Message time');
  await new Promise((resolve, reject) =>
    api.message.signAndSend(alice, ({ events, status }) =>
      events.forEach(({ event: { method } }) => {
        if (method === 'MessageEnqueued' && status.isInBlock) {
          console.time('Message time');
        }
        if (method === 'ExtrinsicSuccess' && status.isFinalized) {
          resolve(method);
        } else if (method === 'ExtrinsicFailed') {
          reject(method);
        }
      }),
    ),
  );

  console.log(await reply);
  console.timeEnd('Message time');
};

main()
  .catch((error) => {
    console.log(error);
    process.exit(1);
  })
  .then(() => {
    process.exit(0);
  });
