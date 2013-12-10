#!/usr/bin/env node

var fs = require('fs')
  , util = require('util')
  , npm = require('npm')
  , pkginfo = require('pkginfo')(module)
  , request = require('request')
  , optimist = require('optimist')
  , path = require('path')
  ;

var argv = optimist
    .usage('reggie publish               --> Publish current module (from module root)\n' +
           'reggie info <package_name>   --> Show JSON info about a particular package\n' +
           'reggie mirror <package_name> --> Publish an existing NPM package from https://registry.npmjs.org/')
    .default({u: 'http://127.0.0.1:8080'})
    .describe('u', 'The base URL of the Reggie server (e.g. http://reggie:8080)')
    .describe('p', 'The URL of your proxy server (nice when inside corporate network, e.g. http://proxy.intra.net/)')
    .alias('u', 'url')
    .alias('p', 'proxy')
    .demand(['u'])
    .argv;

if (argv.h) {
  optimist.showHelp();
  process.exit(0);
}

argv.command = argv._[0];
argv.param1 = argv._[1];

/* Use proxy? */
if(argv.proxy) {
  request = request.defaults({ proxy: argv.proxy, strictSSL: false });
}


var rootUrl = argv.url;


if (argv.command === 'publish') {
  npm.load(null, function (err) {
    if (err) throw err;
    npm.commands.pack([], function (err, data, a, b) {
      if (err) throw err;

      // as described here: https://npmjs.org/api/pack.html
      var packagejson = JSON.parse(fs.readFileSync('package.json'));
      var name = packagejson.name;
      var version = packagejson.version
      var packageFile = name + '-' + version + '.tgz';
      var packageUrl = rootUrl + '/package/' + name + '/' + version;
      fs.createReadStream(packageFile).pipe(request.put(packageUrl, function (err, resp, body) {
        if (err) throw err;
        if (resp.statusCode === 200) {
          console.error('successfully published version ' + version + ' of ' + name + ': ' + packageUrl);
        }
        else {
          console.error('uh oh, something unexpected happened (' + resp.statusCode + ')');
        }
        fs.unlink(packageFile);
        console.log("done")
      }));
    });

  })
}
else if (argv.command === 'info' && argv.param1) {
  var url = argv.url + '/info/' + argv.param1;
  request({
    uri: url,
    json: true
  }, handleDataResponse)
}
else if (argv.command === 'index') {
  var url = argv.url + '/index';
  request({
    uri: url,
    json: true
  }, handleDataResponse)
}
else if (argv.command === 'mirror' && argv.param1) {
  var npmPackage = argv.param1
      , mirror = require('./lib/mirror')
      , version;

  mirror(npmPackage, version, argv.url, request);
}
else {
  optimist.showHelp();
}

function handleDataResponse (err, statusCode, body) {
  if (err) throw err;
  console.log(util.inspect(body, null, 20, true));
  console.log('done');
  process.exit(0);
}
