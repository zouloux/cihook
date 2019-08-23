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
	path=$(pwd)
	branch=$1
	commit=$(git log -1 --pretty=%B)

	# Call node exec and script with absolute path
	# To be compatible with any Git shell ( missing PATH )
	${node} ${script} run $path -b $branch -m $commit
`;

function exec ( message, command, options = {} )
{
	// Show message if not falsy
	message && console.log( message );

	// Run command and return string
	return childProcess.execSync( command, {
		// Remove stdout ( but keep stderr ) if there is a message
		stdio: message ? [0, null, 2] : 'pipe',
		// Inject and override user options
		...options
	}).toString();
}

function hash ( content, length = 8 )
{
	return crypto.createHash('md5').update( content ).digest('hex').substring( 0, length );
}

function slugHash ( content, length )
{
	// Slugify to keep folder path human readable
	const slug = content
		.replace(/[\/.:@]/g, '-') 	// Convert path related chars to dashes
        .replace(/-{2,}/g, '-')     // Deleting multiple dashes
        .replace(/^-+|-+$/g, '');	// Remove leading and trailing slashes);

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
		'workspace': path.join( require('os').homedir(), 'cihook-workspace' )
	});

	// Get workspace path from config store
	workspace = config.get('workspace');

	// Next lines will create needed files
	if ( !createNeededFiles ) return;

	// Create workspace folder if it does not already exists
	if ( !fs.existsSync(workspace) )
		fs.mkdirSync(workspace);

	// Check if post-update script has already been created
	/*
	if ( !fs.existsSync(postUpdatePath) )
	{
		// Create it from template and add it to this package folder
		const scriptContent = postUpdateScriptTemplate( process.execPath, path.join(__dirname, 'cihook.js') );
		fs.writeFileSync( postUpdatePath, scriptContent );
		fs.chmodSync(postUpdatePath, '0755');
	}
	*/
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
			throw new Error('This path is not a valid git repository (missing hooks directory).');

		//const symlinkPath = path.join(gitPath, 'hooks/post-update');


		let stdout = '';
		/*
		if ( fs.existsSync(symlinkPath) )
		{
			const oldPath = postUpdatePath + '.old';
			fs.existsSync(oldPath) && fs.unlinkSync(oldPath);
			fs.renameSync(symlinkPath, symlinkPath + '.old');
			stdout += `post-update hook already exists. Moved to post-update.old.\n`;
		}
		*/

		//fs.symlinkSync(postUpdatePath, symlinkPath);

		const hookPath = path.join(gitPath, 'hooks/post-update');

		if (fs.existsSync(hookPath))
			fs.unlinkSync(hookPath);

		// Create it from template and add it to this package folder
		const scriptContent = postUpdateScriptTemplate( process.execPath, path.join(__dirname, 'cihook.js') );
		fs.writeFileSync( hookPath, scriptContent );
		fs.chmodSync(postUpdatePath, '0755');

		stdout += `${gitPath} repository successfully hooked to cihook.`;

		return stdout;
	},

	linkAll ( path )
	{
		const glob = require('glob');

		const folders = glob.sync( path );

		console.log(folders);
	},

	run ( gitPath, branch = 'master', message = '' )
	{
		initConfig();

		// Get git path last folder to have an human readable part for the workspace
		const lastFolderGitPath = gitPath.substring(gitPath.lastIndexOf('/'), gitPath.length);

		// Create a project and branch path with hashes
		const projectPath = path.join( workspace, slugHash( lastFolderGitPath ) );
		const branchName = slugHash( branch );
		const branchPath = path.join( projectPath, branchName );

		//const remoteURL = exec(`git config --get remote.origin.url`);
		/*
		console.log('CI HOOK RUN');
		console.log({
			gitPath,
			branch,
			message,
			lastFolderGitPath,
			projectPath,
			branchPath
		});
		*/

		// Get flags from message
		const flags = message.toLowerCase().split(' ').filter( a => a.indexOf('--') === 0 ).map( a => a.substring(2, a.length) );

		// Clean all project
		if ( flags.indexOf('cleanproject') >= 0 )
		{
			console.log('Cleaning project workspace ...');
			rimraf( projectPath );
		}

		// Clean branch
		if ( flags.indexOf('cleanbranch') >= 0 || flags.indexOf('clean') >= 0 )
		{
			console.log('Cleaning branch workspace ...');
			rimraf( branchPath );
		}

		// Do not continue if we have a nohook flag
		if ( flags.indexOf('nohook') >= 0 )
			return `CI Hook disabled with --nohook flag.`;

		// Create project workspace folder
		if ( !fs.existsSync( projectPath ) )
			fs.mkdirSync( projectPath );

		// Get cihook.js from repository
		let cihookConfigContent;
		try
		{
			cihookConfigContent = exec(0, `git --no-pager --git-dir ${gitPath} show ${branch}:cihook.js`);
		}
		catch ( e )
		{
			return stripIndent`
				Cihook configuration file not found.
				To enable CI-hook on this repo, create a cihook.js file in repository root.
				More info on https://github.com/zouloux/cihook
			`;
		}

		// Try to parse cihook config file
		let cihookConfig;
		try
		{
			cihookConfig = require('require-from-string')( cihookConfigContent );
		}
		catch ( e )
		{
			throw new Error(`Parse error in cihook.js.`);
		}

		// Check if there is a 'run' function if config file
		if ( !('run' in cihookConfig) )
		{
			return stripIndent`
				Hook not found in cihook.js.
				Add an exported function named 'run' to run hooks.
				More info on https://github.com/zouloux/cihook
			`;
		}

		// Injected set of cihook tools for cihook.js file
		const injectedCihook = {
			/**
			 * Pull current branch into workspace
			 */
			pull ()
			{
				! fs.existsSync( branchPath )
				? exec(
					`Cloning project workspace ...`,
					`git clone ${gitPath} ${branchName} && cd ${branchName} && git checkout ${branch}`,
					{ cwd: projectPath }
				)
				: exec(
					`Updating project workspace ...`,
					`git pull && git checkout ${branch}`,
					{ cwd: branchPath }
				);
			},

			/**
			 * Execute a command into current workspace
			 * @param message Message to output into stdout. Flasy to output nothing.
			 * @param command Command to execute on server. CWD will be in workspace.
			 * @param options @see execSync options in node doc
			 */
			exec ( message, command, options = {} )
			{
				return exec( message, command, {
					// Working directory is workspace
					cwd: branchPath,
					// Default timeout is 1 hour
					timeout: 60 * 60 * 1000,
					// Injection and override user options
					...options
				});
			}
		};

		// Run hook with cihook tools, branch and message info
		cihookConfig.run( injectedCihook, branch, message, flags );
	}
};