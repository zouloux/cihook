const fs = require('fs');
const path = require('path');
const stripIndent = require('common-tags').stripIndent;
const crypto = require('crypto');
const rimraf = require('rimraf').sync;
const childProcess = require('child_process');
const sanitize = require("sanitize-filename");

let config;
let workspace;

const postUpdatePath = path.join(__dirname, 'post-update.sh');

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

function exec ( message, command )
{
	console.log( message )
	childProcess.execSync( command )
}

function hash ( content, length = 8 )
{
	return crypto.createHash('md5').update( content ).digest('hex').substring( 0, length );
}

function slugHash ( content, length )
{
	// Slugify to keep folder path human readable
	const slug = content
		.replace(/[\/.\:.\@.]/g, '-') 	// Convert path related chars to dashes
        .replace(/\-{2,}/g, '-')        // Deleting multiple dashes
        .replace(/^\-+|\-+$/g, '')		// Remove leading and trailing slashes);

    // Sanitize slugified content and append a small hash to avoid collisions
	return [
		sanitize( slug ),
		hash( content, length )
	].join('-')
}

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
		return `Cihook workspace set to ${gitPath}`;
	},
	
	clean ()
	{
		initConfig();
		console.log('Clear workspace');
	},

	link ( gitPath )
	{
		initConfig();

		if ( !fs.existsSync( path.join(gitPath, 'hooks') ) )
			throw new Error('This path is not a valid git repository (missing hooks directory).', 1);

		fs.symlinkSync(postUpdatePath, path.join(gitPath, 'hooks/post-update'));

		return `${gitPath} repository successfully hooked to cihook.`;
	},

	run ( gitPath, branch = 'master', message = '' )
	{
		initConfig();

		//console.log('Run hook', gitPath, branch, message );

		const projectPath = path.join( workspace, slugHash( gitPath ) );
		const branchPath = path.join( projectPath, slugHash( branch ) );

		if ( message.indexOf('--cleanProject') > 0)
		{
			console.log('Cleaning project workspace ...');
			rimraf( projectPath );
		}
		if ( message.indexOf('--cleanBranch') > 0 || message.indexOf('--clean') > 0 )
		{
			console.log('Cleaning branch workspace ...');
			rimraf( branchPath );
		}

		if ( !fs.existsSync( projectPath ) )
			fs.mkdirSync( projectPath );

		// git --no-pager --git-dir /path/to/bar/repo.git show branch:path/to/file >file

		// TODO : Get ci hook config file and cache if
		// TODO : Halt and warning if not exists

		//exec('OOOO', `git --no-pager --git-dir ${gitPath} show ${branch}:cihook.js > ${branchPath}.js`);
		//process.exit(0);

		// TODO : Parse config file and clone if needed

		! fs.existsSync( branchPath )
		? exec(
			`Cloning project workspace ...`,
			`git clone ${gitPath} ${branchPath}`
		)
		: exec(
			`Updating project workspace ...`,
			`cd ${branchPath} && git pull`
		);

		// TODO : Exec config file actions
	}
};