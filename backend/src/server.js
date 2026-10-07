require('dotenv').config();
const app = require('./app');

const PORT = parseInt(process.env.PORT, 10) || 3001;

app.listen(PORT, () => {
  console.log(`Prairie Ridge backend listening on port ${PORT}`);
});