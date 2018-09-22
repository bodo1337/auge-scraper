var request = require('request');
var fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

//parse DOM
let parseDOM = (html) => {
    let dom = new JSDOM(html);
    element = dom.window.document.querySelectorAll(".eintrag");
    var list = [];
    element.forEach(function(element) {
    list.push(element.querySelector("h2").querySelector("a").getAttribute("href"));
    });
    return(list);
}

//gets html
let getURL = (url) => {
    return new Promise((resolve, reject) => {
        request(url, function (error, response, body) {
            if(error){
                reject('error:', error);
            }
            if(body){
                resolve(body);
            }
        });
    });
}
//write to file
let writeToCSV = (data, number) => {
    if (!fs.existsSync("results/")){
        fs.mkdirSync("results/");
    }
    var file = fs.createWriteStream("results/" + Date.now().toString() + "--" + number + ".csv");
    file.write('"Name' + '";"' + "Ansprechpartner" + '";"' + "Strasse" + '";"' + "PLZ" + '";"' + "Stadt" + '";"' + "Land" + '";"' + "Gründung" + '";"' + "TEL" + '";"' + "URL" + '"\r\n');
    data.forEach((element) => {
        file.write('"' + element.name + '";"' + element.ansprechPartner + '";"' + element.strasse + '";"' + element.plz + '";"' + element.stadt + '";"' + element.land + '";"' + element.gründungsJahr + '";"' + element.tel + '";"' + element.url + '"\r\n');
    });
    file.end();
}
async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array)
    }
  }
const delay = ms => new Promise(res => setTimeout(res, ms));
//returns list with channels
async function getAllChannels (url) {
    let stillResults = true;
    let counter = 1;
    
    let entries = [];
    let postleitzahlen = fs.readFileSync('plz.txt').toString().split("\n");
    let postleitzahlCounter = 3265;
    while(stillResults){
        let html;
        let plz = postleitzahlen[postleitzahlCounter];
        if(counter < 2){
            try {
                html = await getURL(url + `?plz=${plz}&sort=edat&umkreis=0`);
            } catch(e) {
                await delay(5000);
                html = "";
                console.log("error in receiving data for plz: " + plz);
            }
            console.log(plz);
        } else {
            try {
                html = await getURL(url + "s" + counter + `?plz=${plz}&sort=edat&umkreis=0`);
            } catch(e) {
                await delay(5000);
                html = "";
                console.log("error in receiving data for plz: " + plz);
            }
            console.log(plz);
        }
        let result = parseDOM(html);
        if(result.length < 15 || entries.includes(result[0])){
            counter = 1;
            postleitzahlCounter++;
            if(result.length > 0 && !entries.includes(result[0])){
                entries = entries.concat(result);
                console.log("Scrapped " + entries.length + " entries...");
            }
            if(postleitzahlen.length == postleitzahlCounter) stillResults = false;
        }else{
            counter++;
            entries = entries.concat(result);
            console.log("Scrapped " + entries.length + " entries...");
        }       
    }
    let dataSets = [];
    let setsCollected = 0;
    let start = async () => {
        await asyncForEach(entries, async (listingUrl) => {
            await getURL("https://dasauge.de" + listingUrl).then((html) => {
                return getAllInfoListing(html);
            }).then((data) => {
                dataSets = dataSets.concat(data);
                console.log("Fetched " + setsCollected++ + " datasets...");
            }).catch((e) => {
                console.log("error in receiving data for plz: " + plz + "Error: " + e);
            })
            if(setsCollected % 1000 == 0) {
                saveResults(dataSets, `${postleitzahlCounter}-${setsCollected}`);
            }
        })
        saveResults(dataSets, `${postleitzahlCounter}-${setsCollected}`);
    }
    start();
}
saveResults = (dataSets, number) => {
    console.log(dataSets);
    console.log("Writing to CSV...");
    writeToCSV(dataSets, number);
    console.log("Saved CSV!");
}

let getAllInfoListing = (html) => {
    return new Promise((resolve, reject) => {

    let dom = new JSDOM(html);

    let url;
    try {
        url = dom.window.document.querySelector('[itemprop=sameAs]').getAttribute("href");
    }
    catch(err) {
        url = "";
    }
    let gründungsJahr;
    try {
        gründungsJahr = dom.window.document.querySelector('[itemprop=foundingDate]').textContent;
    }
    catch(err) {
        gründungsJahr = "";
    }
    let ansprechPartner;
    try {
        ansprechPartner = dom.window.document.querySelector('.n').textContent;
    }
    catch(err) {
        ansprechPartner = "";
    }

    //Adresse
    let name;
    try {
        name = dom.window.document.querySelector('.summary').textContent;
    }
    catch(err) {
        name = "";
    }
    let postleitzahl;
    try {
        postleitzahl = dom.window.document.querySelector('[itemprop=postalCode]').textContent;
    }
    catch(err) {
        postleitzahl = "";
    }
    let stadt;
    try {
        stadt = dom.window.document.querySelector('[itemprop=addressLocality]').textContent;
    }
    catch(err) {
        stadt = "";
    }
    let land;
    try {
        land = dom.window.document.querySelector('[itemprop=addressCountry]').textContent;
    }
    catch(err) {
        land = "";
    }
    //DECRYPT
    let strasse = "";
    let tel = "";
    try {
        let ds_uncrypt = dom.window.document.querySelectorAll(".ds_uncrypt");
        ds_uncrypt.forEach((element) => {
            let crypt = decrypt(element.dataset.inh);
            let cryptDom = new JSDOM(crypt);
            if(cryptDom.window.document.querySelector('[itemprop=streetAddress]')) strasse = cryptDom.window.document.querySelector('[itemprop=streetAddress]').textContent;
            if(cryptDom.window.document.querySelector('[itemprop=telephone]')) tel = cryptDom.window.document.querySelector('[itemprop=telephone]').textContent;
            tel = tel.replace(/[^0-9]/g, '');
        })
    }
    catch(err) {
        console.log(err);
    }

    let listing = {
        tel: tel,
        url: url,
        name: name,
        ansprechPartner: ansprechPartner,
        gründungsJahr: gründungsJahr,
        strasse: strasse,
        plz: postleitzahl,
        stadt: stadt,
        land: land
    }
    resolve(listing);
    });
}
function decrypt(ket) {
    var s = new String;
    var i;
    var j = 0;
    for ( i = 0; i < ket.length; i += 4){
        s += String.fromCharCode(parseInt(ket.substr(i,4),16)-j);
        j++;
    }
    return s;
}
getAllChannels("https://dasauge.de/profile/konzepter/");