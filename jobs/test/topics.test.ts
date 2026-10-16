import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify, fieldsOf } from '../../shared/topics.ts';

test('konu sınıflandırması: yeni alanlar (kuantum, blokzincir, biyoinformatik, eğitim, RF, sensör, EV, yarıiletken)', () => {
  assert.ok(classify('IEEE International Conference on Quantum Computing and Engineering (QCE)').includes('quantum'));
  assert.ok(classify('Workshop on Quantum Software and Qubit Control').includes('quantum'));
  assert.ok(classify('Post-Quantum Cryptography Standardization Conference').includes('quantum'));
  assert.ok(!classify('Quantum Dot Light Emitting Diodes').includes('quantum')); // kuantum noktası ≠ kuantum hesaplama
  assert.ok(classify('International Conference on Blockchain and Smart Contracts').includes('blockchain'));
  assert.ok(classify('Intelligent Systems for Molecular Biology (ISMB): genomic data').includes('bioinformatics'));
  assert.ok(classify('ACM Technical Symposium on Computer Science Education (SIGCSE)').includes('education'));
  assert.ok(!classify('International Conference on Machine Learning').includes('education'));
  assert.ok(classify('IEEE Antennas and Propagation Symposium, millimeter-wave arrays').includes('rf'));
  assert.ok(classify('IEEE Sensors Conference').includes('sensors'));
  assert.ok(classify('IEEE Transportation Electrification Conference: electric vehicle charging').includes('ev'));
  assert.ok(classify('International Electron Devices Meeting: semiconductor device and transistor physics').includes('semiconductor'));
  assert.deepEqual(fieldsOf(['quantum', 'rf']).sort(), ['cs', 'ee']);
});
