const https = require('https');

https.get('https://www.luxyclad.com/finishes', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    const matches = data.match(/<[^>]+>([^<]+)<\/[^>]+>/g);
    if (matches) {
      const text = matches.map(m => m.replace(/<[^>]+>/g, '')).join('\n');
      console.log(text.substring(0, 5000));
    }
  });
}).on('error', (err) => {
  console.log("Error: " + err.message);
});
