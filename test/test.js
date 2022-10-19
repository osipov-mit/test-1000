const { decodeAddress, GearApi, GearKeyring } = require('@gear-js/api');
const assert = require('assert');
const { readdirSync, readFileSync } = require('fs');
const path = require('path');

assert.notStrictEqual(process.argv[2], undefined, 'Number of programs in one batch is unspecified');
const programsInBatch = Number(process.argv[2]);

assert.notStrictEqual(process.argv[3], undefined, 'Number of batches is unspecified');
const numberOfBatches = Number(process.argv[3]);

/**
 *
 * @param {GearApi} api
 * @param {*} paths
 * @returns
 */
async function batchUploads(api, paths) {
  const alice = await GearKeyring.fromSuri('//Alice');
  const codes = paths.map((path) => readFileSync(path));
  const txs = codes.map((code) => api.program.upload({ code, gasLimit: 0 }));
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
  const api = await GearApi.create();

  console.log(`  [*] Connected to ${await api.nodeName()}`);
  const alice = await GearKeyring.fromSuri('//Alice');

  const dir = readdirSync(path.resolve(__dirname, '../test_programs')).map((name) =>
    path.resolve(__dirname, '../test_programs', name),
  );

  const programIds = [];
  for (let i = 0; i < numberOfBatches; i += 1) {
    try {
      programIds.push(
        ...(await batchUploads(api, dir.slice(i * programsInBatch, i * programsInBatch + programsInBatch))),
      );
    } catch (error) {
      console.log(`  [ERROR] when uploading programs in batch`);
      throw error;
    }
  }

  console.log(`  [*] uploaded ${programIds.length} programs`);

  const code = readFileSync(
    '/Users/dmitriiosipov/gear/test/1000-messages/target/wasm32-unknown-unknown/release/test_1000.opt.wasm',
  );

  const payload = api.createType('Vec<[u8;32]>', programIds).toHex();
  let gas = await api.program.calculateGas.initUpload(decodeAddress(alice.address), code, payload, 0, true);
  const { programId } = api.program.upload({ code, initPayload: payload, gasLimit: gas.min_limit });

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

  api.message.send({ destination: programId, payload: '0x', gasLimit: api.blockGasLimit });
  const reply = listenToUserMessageSent(api, programId);

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

  const replyMessage = await reply;

  if (Number(replyMessage.message.reply.exitCode) !== 0) {
    console.log(`  [ERROR] Message processing failed due to ${replyMessage.message.payload}`);
  } else {
    console.log(`  [*] Message processed sucessfuly`);
  }
  console.timeEnd('Message processing time');
};

main()
  .catch((error) => {
    console.log(error);
    process.exit(1);
  })
  .then(() => {
    process.exit(0);
  });
