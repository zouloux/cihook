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
	${node} ${script} run $path $branch $commit
`;

function exec ( message, command, cwd )
{
	message && console.log( message );
	return childProcess.execSync( command, cwd ? { cwd } : null );
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
	if ( !fs.existsSync(postUpdatePath) )
	{
		// Create it from template and add it to this package folder
		const scriptContent = postUpdateScriptTemplate( process.execPath, path.join(__dirname, 'cihook.js') );
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
			throw new Error('This path is not a valid git repository (missing hooks directory).');

		const symlinkPath = path.join(gitPath, 'hooks/post-update');

		let stdout = '';
		if ( fs.existsSync(symlinkPath) )
		{
			const oldPath = postUpdatePath + '.old';
			fs.existsSync(oldPath) && fs.unlinkSync(oldPath);
			fs.renameSync(symlinkPath, symlinkPath + '.old');
			stdout += `post-update hook already exists. Moved to post-update.old.\n`;
		}

		fs.symlinkSync(postUpdatePath, symlinkPath);
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

		//const remoteURL = exec(`git config --get remote.origin.url`);

		// Get git path last folder to have an human readable part for the workspace
		const lastFolderGitPath = gitPath.substring(gitPath.lastIndexOf('/'), gitPath.length);

		// Create a project and branch path with hashes
		const projectPath = path.join( workspace, slugHash( lastFolderGitPath ) );
		const branchPath = path.join( projectPath, slugHash( branch ) );

		console.log('CI HOOK RUN');
		console.log({
			gitPath,
			branch,
			message,
			lastFolderGitPath,
			projectPath,
			branchPath
		});

		// Clean all project
		if ( message.indexOf('--cleanProject') > 0)
		{
			console.log('Cleaning project workspace ...');
			rimraf( projectPath );
		}

		// Clean branch
		if ( message.indexOf('--cleanBranch') > 0 || message.indexOf('--clean') > 0 )
		{
			console.log('Cleaning branch workspace ...');
			rimraf( branchPath );
		}

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
			cihookConfig = require('require-from-string')( cihookConfigContent.toString() );
		}
		catch ( e )
		{
			throw new Error(`Parse error in cihook.js.`);
		}

		if ( !('run' in cihookConfig) )
		{
			return `
				Hook not found in cihook.js.
				Add an exported function named 'run' to run hooks.
				More info on https://github.com/zouloux/cihook
			`;
		}

		const injectedCihook = {
			pull ()
			{
				! fs.existsSync( branchPath )
				? exec(
					`Cloning project workspace ...`,
					`git clone ${gitPath} ${branchPath}`
				)
				: exec(
					`Updating project workspace ...`,
					`cd ${branchPath} && git pull`
				);
			},

			exec ( message, command )
			{
				exec( message, command, branchPath );
			}
		};

		cihookConfig.run( injectedCihook, branch, message );
	}
};