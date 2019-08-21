const fs = require('fs');
const path = require('path');
const stripIndent = require('common-tags').stripIndent;

let args;
let flags;
let config;
let workspace;

//config = JSON.parse( fs.readFileSync('cihookrc.json').toString() );

/**
 * TODO : Explain why
 */
const postUpdateScriptTemplate = (node, script) => stripIndent`
	#!/bin/bash

	# Get repo path / updated branch / last commit message
	path=$(git config --get remote.origin.url)
	branch=$1
	commit=$(git log -1 --pretty=%B)

	${node} ${script} run $path $branch $commit
`;

/**
 *
 */
function initConfig ( createNeededFiles = true )
{
	// Get config store and package info
	const Configstore = require('configstore');
	const packageJson = require('./package.json');

	// Create a new config store for this package
	config = new Configstore(packageJson.name, {
		// Default workspace path
		'workspace': '~/cihook-workspace/'
	});

	// Get workspace path from config store
	workspace = config.get('workspace');

	// Next lines will create needed files
	if ( !createNeededFiles ) return;
	
	// Create workspace folder if it does not already exists
	if ( !fs.existsSync(workspace) )
		fs.mkdirSync(workspace);

	// Check if post-update script has already been created
	const postUpdatePath = path.join(__dirname, 'post-update.sh');
	if ( !fs.existsSync(postUpdatePath) )
	{
		// Create it from template and add it to this package folder
		const scriptContent = postUpdateScriptTemplate( process.execPath, __filename );
		fs.writeFileSync( postUpdatePath, scriptContent );
		fs.chmodSync(postUpdatePath, '0755');
	}
}

module.exports = {

	setup ( gitPath )
	{
		initConfig( false );
		config.set('workspace', gitPath);
		console.log('Cihook workspace set to', gitPath);
	},
	
	clean ()
	{
		initConfig();
		console.log('Clear workspace');
	},

	link ( gitPath )
	{
		initConfig();
		console.log('Link to', gitPath);
	},

	run ( gitPath, branch, message )
	{
		initConfig();
		console.log('Run hook', gitPath, branch, message );
	}
};