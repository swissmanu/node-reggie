var Q = require('q')
	, semver = require('semver')
	, path = require('path')
	, mkdirp = require('mkdirp')
	, fs = require('fs')
	, cachePath = path.join(process.cwd(), 'data', 'cache');

function DependencyTreeResolver(accessor, request) {
	var self = this;

	self.accessor = accessor;
	self.request = request;
	self.collectedDependencies = {};
	self.collectedValues = [];
	self.npmRegistry = 'https://registry.npmjs.org/'

	if(!fs.existsSync(cachePath)) {
		mkdirp(cachePath);
	}

	return this;
}

DependencyTreeResolver.prototype.resolve = function resolve(npmModule, version) {
	var self = this
		, promise = traverseTree.call(this, npmModule, version, 0)
		.then(function() {
			return self.collectedValues;
		});

	return promise;
}



function traverseTree(npmModule, version, depth) {
	var self = this
		, promise;

	promise = fetchNpmModuleInformation.call(self, npmModule)
	.then(function(npmModuleInformation) {
		if(!npmModuleInformation) return;

		if(version === undefined || version === null || version === 'latest' || version.indexOf('git://') !== -1 || version.indexOf('https://') !== -1 || version.indexOf('http://') !== -1) {
			version = npmModuleInformation['dist-tags'].latest;
		} else {
			version = cleanVersion(version);

			var availableVersions = Object.keys(npmModuleInformation.versions)
				, satisfyingVersion = getSatisfyingVersion(version, availableVersions);

			if(satisfyingVersion) {
				version = satisfyingVersion;
			} else {
				console.error('Could not find version of ' + npmModule + ' that satisfy version ' + version);
				return;
			}
		}

		console.log('Lookup dependencies for ' + npmModule.cyan);

		var packageJson = npmModuleInformation.versions[version]
			, dependencies = {};

		// Add version of this dependency to collectedVersions:
		if(!self.collectedDependencies[npmModule]) {
			self.collectedDependencies[npmModule] = [version];
		} else if(self.collectedDependencies[npmModule].indexOf(version) !== -1) {
			return;
		} else {
			self.collectedDependencies[npmModule].push(version);
		}

		// Apply self.accessor on this module and add its result to the
		// collectedValues.
		self.collectedValues.push(self.accessor(packageJson));

		// Get dependencies of this module and process them too:
		collectDependencies(packageJson.dependencies, dependencies);
		//collectDependencies(packageJson.devDependencies, dependencies);
		//collectDependencies(packageJson.peerDependencies, dependencies);

		// Remove dependencies on module itself. Just to be sure.
		if(dependencies[npmModule]) {
			var index = dependencies[npmModule].indexOf(version);
			if(index !== -1) {
				dependencies[npmModule].splice(index, 1);
			}
		}

		var chain = Object.keys(dependencies).reduce(function(previous, dependency) {
			return previous.then(function(collectedRepositories) {
				// TODO: what if the module has the same dependancy defined in
				//       dependencies and devDependencies with two different
				//       versions? [0] will not be enough tehn.
				//       Low possibility, but still possible
				var dependencyVersion = dependencies[dependency][0];

				if(self.collectedDependencies[dependency]) {
					var availableVersions = self.collectedDependencies[dependency]
						, satisfied = availableVersions.some(function(availableVersion) {
							return semver.satisfies(availableVersion, dependencyVersion);
						});

					if(!satisfied) {
						return traverseTree.call(self, dependency, dependencyVersion, depth+1);
					} else {
						return;
					}
				} else {
					return traverseTree.call(self, dependency, dependencyVersion, depth+1);
				}
			});
		}, Q.resolve());

		return chain;
	});

	return promise;
}



function getSatisfyingVersion(version, availableVersions) {
	var satisfyingVersion;

	availableVersions.every(function(availableVersion) {
		if(semver.satisfies(availableVersion, version)) {
			satisfyingVersion = availableVersion;
			return false;
		} else {
			return true;
		}
	});

	return satisfyingVersion;
}

function fetchNpmModuleInformation(npmModule) {
	var url = this.npmRegistry + npmModule
		, deferred = Q.defer()
		, cacheFile = path.join(cachePath, npmModule + '.json');

	if(fs.existsSync(cacheFile)) {
		deferred.resolve(require(cacheFile));
	} else {
		this.request(url, function(error, response, body) {
			if(!error && response.statusCode === 200) {
				var packageJson = JSON.parse(body);
				fs.writeFileSync(cacheFile, body);
				deferred.resolve(packageJson);
			} else {
				console.log(npmModule + ' not available in npm registry :(');
				deferred.resolve();
			}
		});
	}

	return deferred.promise;
}

function collectDependencies(dependencies, collectedDependencies) {
	if(dependencies !== undefined) {
		var keys = Object.keys(dependencies);

		keys.forEach(function(dependency) {
			var version = dependencies[dependency];

			if(collectedDependencies[dependency]) {
				if(collectedDependencies[dependency].indexOf(version) === -1) {
					collectedDependencies[dependency].push(version);
				}
			} else {
				collectedDependencies[dependency] = [version];
			}
		});
	}
}

function cleanVersion(version) {
	var prefixedWords = ['rc', 'beta'];

	// Some packages have no '-' before the rc or beta postfix.
	// Try to fix:
	prefixedWords.forEach(function(prefixedWord) {
		var index = version.indexOf(prefixedWord);

		if(index !== -1) {
			if(version.substr(index-1,1) !== '-') {
				version = version.substr(0, index) +
					'-' + version.substr(index);
			}
		}
	});

	return version;
}


module.exports = DependencyTreeResolver;