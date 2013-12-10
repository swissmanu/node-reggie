var DependecyTreeResolver = require('./dependencytreeresolver')
	, Q = require('q')
	, colors = require('colors');

function mirror(npmModule, version, reggieUrl, request) {
	var tarballResolver = new DependecyTreeResolver(function (packageJson) {
		return {
			name: packageJson.name
			, version: packageJson.version
			, tarball: packageJson.dist.tarball
		};
	}, request);

	if(!request) {
		request = require('request');
	}

	console.log('');
	console.log(('>> Mirror ' + npmModule).yellow);
	console.log(('>> Step 1: Lookup dependencies <<').yellow);

	tarballResolver.resolve(npmModule, version)
	.then(function(modules) {
		console.log('');
		console.log((modules.length + ' packages found to mirror').yellow);
		console.log('');
		console.log(('>> Step 2: Download packages and publish them to Reggie <<').yellow);
		var tasks = [];

		modules.forEach(function(module) {
			tasks.push(function() {
				var deferred = Q.defer()
					, nameAndVersion = module.name + ' ' + module.version;

				console.log('Download and publish ' + nameAndVersion.cyan + (' (' + module.tarball + ')').grey);
				request.get(module.tarball, function(err, response) {
					if(err || response.statusCode !== 200) {
						if(!err) {
							err = 'Response status code: ' + response.statusCode;
						}
						deferred.reject(err);
					}
				})
				.pipe(request.put(reggieUrl + '/package/' + module.name + '/' + module.version, function(err, response) {
					if(!err && response.statusCode === 200) {
						deferred.resolve();
					} else {
						if(!err) {
							err = 'Response status code: ' + response.statusCode;
						}
						deferred.reject(err);
					}
				}));

				return deferred.promise;
			});
		});

		return tasks.reduce(Q.when, Q())
		.then(function() {
			console.log('')
			console.log(('>> Successfully mirrored ' + npmModule + ' to Reggie <<').yellow);
			console.log('Use ' + ('npm --registry=' + reggieUrl + ' install ' + npmModule).cyan + ' to install.');
		})
	})
	.fail(function(err) {
		console.error(err.toString().red);
	});

}

module.exports = mirror;