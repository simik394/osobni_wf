import { Command } from 'commander';
const chalk = require('chalk');

export class CLIUtils {
    /**
     * Create a basic CLI program
     */
    static createProgram(name: string, description: string, version: string = '1.0.0'): Command {
        const program = new Command();
        program
            .name(name)
            .description(description)
            .version(version);
        return program;
    }

    /**
     * Simple spinner (using console for now, could be enhanced with ora)
     */
    static async withSpinner<T>(message: string, action: () => Promise<T>): Promise<T> {
        process.stdout.write(chalk.blue('ℹ') + ' ' + message + '... ');
        try {
            const result = await action();
            process.stdout.write(chalk.green('✔ Done\n'));
            return result;
        } catch (error) {
            process.stdout.write(chalk.red('✖ Failed\n'));
            throw error;
        }
    }

    /**
     * Print a simple table
     */
    static printTable(headers: string[], rows: any[][]): void {
        if (rows.length === 0) {
            console.log(chalk.gray('(No data)'));
            return;
        }

        // Calculate column widths
        const widths = headers.map((h, i) => {
            const maxRow = Math.max(...rows.map(r => String(r[i] || '').length));
            return Math.max(h.length, maxRow) + 2;
        });

        // Print header
        console.log(
            headers.map((h, i) => chalk.bold(h.padEnd(widths[i]))).join('')
        );
        console.log(
            widths.map(w => '-'.repeat(w - 1)).join(' ')
        );

        // Print rows
        rows.forEach(row => {
            console.log(
                row.map((cell, i) => String(cell || '').padEnd(widths[i])).join('')
            );
        });
    }

    static success(message: string): void {
        console.log(chalk.green('✔ ' + message));
    }

    static error(message: string): void {
        console.error(chalk.red('✖ ' + message));
    }

    static info(message: string): void {
        console.log(chalk.blue('ℹ ' + message));
    }

    static warn(message: string): void {
        console.log(chalk.yellow('⚠ ' + message));
    }
}
