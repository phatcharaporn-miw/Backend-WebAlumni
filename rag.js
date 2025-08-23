<<<<<<< HEAD
// const pool = require('./db');
// const axios = require('axios');

// // ดึงข้อมูล context จากฐานข้อมูล
// async function getRelevantDocs(question) {
//   const [rows] = await pool.query(`
//     SELECT content FROM knowledge_base
//     WHERE MATCH(content) AGAINST (? IN NATURAL LANGUAGE MODE)
//     LIMIT 3
//   `, [question]);
//   return rows.map(r => r.content).join('\n');
// }

// // ส่ง context + question ไปยัง Ollama
// async function askLLM(context, question) {
//   const prompt = `Context:\n${context}\n\nQuestion: ${question}\nAnswer:`;
//   const response = await axios.post('http://localhost:11434/api/generate', {
//     model: 'mistral',
//     prompt,
//     stream: false
//   });
//   return response.data.response;
// }

// module.exports = { getRelevantDocs, askLLM };
=======
const pool = require('./db');
const axios = require('axios');

// ดึงข้อมูล context จากฐานข้อมูล
async function getRelevantDocs(question) {
  const [rows] = await pool.query(`
    SELECT content FROM knowledge_base
    WHERE MATCH(content) AGAINST (? IN NATURAL LANGUAGE MODE)
    LIMIT 3
  `, [question]);
  return rows.map(r => r.content).join('\n');
}

// ส่ง context + question ไปยัง Ollama
async function askLLM(context, question) {
  const prompt = `Context:\n${context}\n\nQuestion: ${question}\nAnswer:`;
  const response = await axios.post('http://localhost:11434/api/generate', {
    model: 'mistral',
    prompt,
    stream: false
  });
  return response.data.response;
}

module.exports = { getRelevantDocs, askLLM };
>>>>>>> 987f0a7205f0d816018c42b116be0b2001d0710c
