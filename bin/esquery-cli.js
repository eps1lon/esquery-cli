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
 *
 * @param {{selector: string; glob: string, verbose: boolean}} argv
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
	let fileCount = 0;
	for await (const file of files) {
		const source = await fs.readFile(file, { encoding: "utf-8" });
		const parseResult = await babel.parseAsync(source, {
			cwd,
			filename: file,
			presets: ["@babel/preset-react", "@babel/preset-typescript"],
		});

		const nodes = esquery.query(parseResult.program, argv.selector);
		if (nodes.length > 0) {
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
				console.log(`${location}:\n${frame}`);
			}
		}

		fileCount += 1;
	}

	if (argv.verbose) {
		console.log(`Queried ${fileCount} files.`);
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
				.example('$0 "TSAsExpression"');
		},
		handler: main,
	})
	.help()
	.strict().argv;