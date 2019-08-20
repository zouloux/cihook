#!/usr/bin/env node

const fs = require('fs');

let flags;
let args;
let path;
let config;
let workspace;

//config = JSON.parse( fs.readFileSync('cihookrc.json').toString() );

module.exports = {

	initConfig ( createWorkspace = true )
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

		//console.log( config.path, workspace );

		// Create workspace folder if it does not already exists
		if ( createWorkspace && !fs.existsSync(workspace) )
			fs.mkdirSync(workspace);
	},

	link ( path )
	{
		module.exports.initConfig();
		console.log('Link to', path);
	},

	run ()
	{
		this.initConfig();
		console.log('Run hook', path, flags );

	},

	clear ()
	{
		module.exports.initConfig();
		console.log('Clear workspace', );
	},

	setup ()
	{
		module.exports.initConfig( false );
		config.set('workspace', path);
		console.log('Cihook workspace path set to', path);
	},

	initCLI ()
	{
		let command;

		args = require('args');

		args.command('setup', 'Setup cihook to get started.', () => command = module.exports.setup);

		//args.command('stop', 'Stop all running tasks.');
		args.command('clean', 'Clear workspace', module.exports.clear);
		
		args.command('link', 'Link a git repository to cihook.', () => command = module.exports.link);

		args
			.option('branch', 'Updated branch', 'master')
			.option('message', 'Last commit message', '')
			.command('run', 'Run main hook from linked git repository. Called from git hook or manually.', () => command = module.exports.run);

		flags = args.parse( process.argv );
		console.log(flags);

		if ( command == null ) return;

		if ( !(1 in args.sub) )
		{
			console.error('Missing path in arguments');
			process.exit(1);
		}

		path = args.sub[1];
		command && command.apply(this);
	}
};


module.exports.initCLI();