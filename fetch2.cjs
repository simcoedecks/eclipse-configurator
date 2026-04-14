const https = require('https');

https.get('https://www.luxyclad.com/finishes', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    const matches = data.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s*(?:Oak|Walnut|Teak|Cherry|Mahogany|Cedar|Fir|Pine|Ash|Wood)/g);
    if (matches) {
      console.log([...new Set(matches)].join('\n'));
    }
    const allText = data.replace(/<[^>]+>/g, ' ');
    const words = allText.match(/\b[A-Z][a-z]+\b/g);
    // console.log(allText.substring(0, 2000));
  });
}).on('error', (err) => {
  console.log("Error: " + err.message);
});
