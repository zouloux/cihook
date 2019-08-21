#!/usr/bin/env node

const cihook = require('./index');
const args = require('args');
const chalk = require('chalk');

/**
 * Get path from arguments and throw error if there is no path given.
 */
function getPath ()
{
	if ( !(1 in args.sub) )
	{
		console.error(`Missing path in arguments.\nType ${chalk.bold('cihook -h')} to know more.`);
		process.exit(1);
	}

	return args.sub[ 1 ];
}

/**
 * Process CLI Action
 */
function processAction ( name, sub, options )
{
	let result;
	try
	{
		if ( name === 'setup' )
			result = cihook.setup( getPath() );

		else if ( name === 'clean' )
			result = cihook.clean();

		else if ( name === 'link' )
			result = cihook.link( getPath() );

		else if ( name === 'run' )
			result = cihook.run( getPath(), options.branch, options.message );
	}
	catch (e)
	{
		console.error( e.message );
		process.exit( e.code || 1);
	}

	if ( typeof result === 'string' )
	{
		console.log( result );
		process.exit(0);
	}
}

/**
 * SETUP command
 */
args.command('setup', 'Setup cihook to get started.', processAction);

/**
 * CLEAN command
 */
args.command('clean', 'Clear workspace', processAction);

/**
 * LINK command
 */
args.command('link', 'Link a git repository to cihook.', processAction);

/**
 * RUN command
 */
args
	.option('branch', 'Updated branch', 'master')
	.option('message', 'Last commit message', '')
	.command('run', 'Run main hook from linked git repository. Called from git hook or manually.', processAction);

// Process arguments and start commands initializers
args.parse( process.argv );

// Show help if no action has been found
args.showHelp();