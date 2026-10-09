const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/Launcherdesk-CRM';
    await mongoose.connect(uri);
    const isLocal = uri.includes('127.0.0.1') || uri.includes('localhost');
    console.log(`✅ MongoDB connected: ${isLocal ? 'Localhost Database (' + uri + ')' : 'Atlas Cloud'}`);
  } catch (err) {
    console.error('❌ MongoDB error:', err);
    process.exit(1);
  }
};

module.exports = connectDB;