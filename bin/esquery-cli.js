#!/usr/bin/env node
import { codeFrameColumns } from "@babel/code-frame";
import babel from "@babel/core";
import esquery from "esquery";
import glob from "fast-glob";
import * as fs from "fs/promises";
import * as path from "path";
import * as process from "process";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

/**
 * @typedef {ReturnType<typeof import('esquery').query>[0]} Node
 */

/**
 * Implementation of https://github.com/dmnd/dedent supporting tabs.
 * @remarks Tabs are not supported in `dedent`: https://github.com/dmnd/dedent/issues/10
 * @param {string} source
 * @returns {string}
 */
function dedent(source) {
	const lines = source.split(/\r?\n/);
	const usesTabs = lines.some((line) => line.startsWith("\t"));

	const minIndentation = Math.min(
		...lines.map((line) => {
			return line.match(/^(( |\t)*)/)[1].length;
		})
	);
	const minIndentationRegExp = new RegExp(
		`^${(usesTabs ? "\t" : " ").repeat(minIndentation)}`
	);
	return lines
		.map((line) => {
			return line.replace(minIndentationRegExp, "");
		})
		.join("\n");
}

/**
 * @param {string} filename
 * @param {string} selector
 * @param {string} cwd
 * @returns {Promise<{ nodes: Node[], source: string }>}
 */
async function queryFile(filename, selector, cwd) {
	const source = await fs.readFile(filename, { encoding: "utf-8" });
	const parseResult = await babel.parseAsync(source, {
		cwd,
		filename,
		presets: ["@babel/preset-react", "@babel/preset-typescript"],
	});

	const nodes = esquery.query(parseResult.program, selector);

	return { nodes, source };
}

/**
 *
 * @param {{includeCodeFrame: boolean, selector: string; glob: string, verbose: boolean}} argv
 */
async function main(argv) {
	const cwd = process.cwd();

	/**
	 * @type {string[]}
	 */
	const ignore = [];
	try {
		const gitignore = await fs.readFile(path.resolve(cwd, ".gitignore"), {
			encoding: "utf-8",
		});
		ignore.push(
			...gitignore.split(/\r?\n/).filter((fullLine) => {
				const line = fullLine.trim();
				if (line.length === 0) {
					return false;
				}
				if (line.startsWith("#")) {
					return false;
				}

				return true;
			})
		);
	} catch {
		// ignore if not exists
	}

	const files = await glob.stream(argv.glob, {
		cwd,
		ignore,
	});
	let didError = false;
	let fileCount = 0;
	for await (const file of files) {
		/**
		 * @type {Node[]}
		 */
		let nodes = [];
		let source = "";
		try {
			const queryResult = await queryFile(file, argv.selector, cwd);
			nodes = queryResult.nodes;
			source = queryResult.source;
		} catch (error) {
			console.error(`${file}: ${error}`);
			// process.exitCode = 1 does not work in node14 when imported.
			// fails with "TypeError: Cannot add property exitCode, object is not extensible"
			didError = true;
		}

		if (argv.verbose && nodes.length > 0) {
			console.log(`${file} ${nodes.length} matches:`);
		}
		for (const node of nodes) {
			const { loc } = node;
			const sourceLines = source.split(/\r?\n/);
			if (loc === undefined) {
				console.log("match with unknown location");
			} else {
				// same as @babel/code-frame
				const linesAbove = 2;
				const linesBelow = 3;
				// we don't use @babel/code-frame because it doesn't handle tabs: https://github.com/babel/babel/issues/12696
				const frame = dedent(
					sourceLines
						.slice(loc.start.line - linesAbove, loc.end.line + linesBelow)
						.join("\n")
				);
				const location = `${file}#${loc.start.line}:${loc.start.column}`;

				if (argv.includeCodeFrame) {
					console.log(`${location}:\n${frame}`);
				} else {
					console.log(`${location}`);
				}
			}
		}

		fileCount += 1;
	}

	if (argv.verbose) {
		console.log(`Queried ${fileCount} files.`);
	}

	if (didError) {
		process.exit(1);
	}
}

yargs(hideBin(process.argv))
	.command({
		command: "$0 <selector> [glob]",
		describe:
			"Queries files for a given AST selector based on `esquery`. " +
			"Selector documentation can be found at https://github.com/estools/esquery",
		builder: (command) => {
			command
				.positional("selector", {
					type: "string",
					description: "CSS like",
				})
				.positional("glob", {
					type: "string",
					description:
						"Files to search. Note that files listed in the .gitignore in the current working directory are ignored by default.",
					default: "**/*.{cjs,js,jsx,mjs,ts,tsx}",
				})
				.option("verbose", {
					type: "boolean",
					description: "Logs additional information",
					default: false,
				})
				.option("include-code-frame", {
					type: "boolean",
					description: "Logs the codeframe of each query result.",
					default: false,
				})
				.example('$0 "TSAsExpression"');
		},
		handler: main,
	})
	.help()
	.strict().argv;
