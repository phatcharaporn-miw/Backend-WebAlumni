const express = require('express');
const router = express.Router();
const axios = require('axios');

router.post('/chatbot', async (req, res) => {
  const { question } = req.body;

  try {
    const response = await axios.post('http://localhost:5000/chat', {
      message: question  // ต้องใช้ชื่อ key = message ให้ตรงกับ Python
    });

    res.json({ answer: response.data.response });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'ไม่สามารถติดต่อระบบแชทบอทได้' });
  }
});

module.exports = router;
