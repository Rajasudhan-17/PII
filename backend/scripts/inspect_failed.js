const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://root:example@127.0.0.1:27017/pii_platform?authSource=admin');
  const records = await mongoose.connection.collection('transformationrecords').find({
    transformationRunId: 'trans_run_6a3dea64-ed2f-4970-935d-205ce5a0cab7',
    status: 'FAILED'
  }).toArray();
  const cIds = records.map(r => r.candidateId);
  const candidates = await mongoose.connection.collection('piicandidates').find({ candidateId: { $in: cIds } }).toArray();
  console.log('Failed candidates texts:');
  for (const c of candidates) {
    console.log(`- [${c.type}] "${c.text}" (has newline: ${c.text.includes('\n')})`);
  }
  await mongoose.disconnect();
}

run().catch(console.error);
