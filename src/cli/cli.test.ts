import { deepStrictEqual } from 'assert';
import { execa } from 'execa';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { join } from 'path';
import { Pool } from 'pg';
import { dedent } from 'ts-dedent';
import packageJson from '../../package.json';
import { RuntimeEnumsStyle } from '../generator';
import { LogLevel } from '../generator/logger/log-level';
import { DateParser } from '../introspector/dialects/postgres/date-parser';
import type { CliGenerateOptions } from './cli';
import { Cli } from './cli';
import { ConfigError } from './config-error';

describe(Cli.name, () => {
  it('should be able to start the CLI', async () => {
    await execa`pnpm build`;
    const binPath = join(process.cwd(), packageJson.bin['kysely-codegen']);
    const output = await execa`node ${binPath} --help`.then((a) => a.stdout);
    deepStrictEqual(output.includes('--help, -h'), true);
  });

  it('should be able to start the CLI with a custom config', async () => {
    const db = new Kysely<any>({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString: 'postgres://user:password@localhost:5433/database',
        }),
      }),
    });

    await db.schema.dropSchema('cli').ifExists().cascade().execute();
    await db.schema.createSchema('cli').execute();
    await db.schema
      .withSchema('cli')
      .createType('status')
      .asEnum(['CONFIRMED', 'UNCONFIRMED'])
      .execute();
    await db.schema
      .createTable('cli.users')
      .addColumn('status', sql`cli.status`)
      .addColumn('user_id', 'serial', (col) => col.primaryKey())
      .execute();

    const output = await new Cli().run({
      argv: ['--camel-case'],
      config: {
        camelCase: false,
        defaultSchemas: ['cli'],
        dialectName: 'postgres',
        includePattern: 'cli.*',
        logLevel: LogLevel.SILENT,
        outFile: null,
        runtimeEnums: true,
        runtimeEnumsStyle: RuntimeEnumsStyle.PASCAL_CASE,
        singular: true,
        url: 'postgres://user:password@localhost:5433/database',
        typeOnlyImports: false,
      },
    });

    expect(output).toStrictEqual(
      dedent`
        /**
         * This file was generated by kysely-codegen.
         * Please do not edit it manually.
         */

        import { ColumnType } from "kysely";

        export enum Status {
          Confirmed = "CONFIRMED",
          Unconfirmed = "UNCONFIRMED",
        }

        export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
          ? ColumnType<S, I | undefined, U>
          : ColumnType<T, T | undefined, T>;

        export interface User {
          status: Status | null;
          userId: Generated<number>;
        }

        export interface DB {
          users: User;
        }

      `,
    );

    await db.schema.dropSchema('cli').cascade().execute();
  });

  it('should parse options correctly', () => {
    const assert = (
      args: string[],
      expectedOptions: Partial<CliGenerateOptions>,
    ) => {
      const cliOptions = new Cli().parseOptions(args, { silent: true });

      deepStrictEqual(cliOptions, {
        url: 'postgres://user:password@localhost:5433/database',
        ...expectedOptions,
      });
    };

    assert(['--camel-case'], { camelCase: true });
    assert(['--date-parser=timestamp'], { dateParser: DateParser.TIMESTAMP });
    assert(['--date-parser=string'], { dateParser: DateParser.STRING });
    assert(['--default-schema=foo'], { defaultSchemas: ['foo'] });
    assert(['--default-schema=foo', '--default-schema=bar'], {
      defaultSchemas: ['foo', 'bar'],
    });
    assert(['--dialect=mysql'], { dialectName: 'mysql' });
    assert(['--domains'], { domains: true });
    assert(['--exclude-pattern=public._*'], { excludePattern: 'public._*' });
    assert(['--help'], {});
    assert(['-h'], {});
    assert(['--include-pattern=public._*'], { includePattern: 'public._*' });
    assert(['--log-level=debug'], { logLevel: LogLevel.DEBUG });
    assert(['--no-domains'], { domains: false });
    assert(['--no-type-only-imports'], { typeOnlyImports: false });
    assert(['--out-file=./db.ts'], { outFile: './db.ts' });
    assert(
      [`--overrides={"columns":{"table.override":"{ foo: \\"bar\\" }"}}`],
      { overrides: { columns: { 'table.override': '{ foo: "bar" }' } } },
    );
    assert(['--print'], { print: true });
    assert(['--singular'], { singular: true });
    assert(['--type-only-imports'], { typeOnlyImports: true });
    assert(['--type-only-imports=false'], { typeOnlyImports: false });
    assert(['--type-only-imports=true'], { typeOnlyImports: true });
    assert(['--url=postgres://u:p@s/d'], { url: 'postgres://u:p@s/d' });
    assert(['--verify'], { verify: true });
    assert(['--verify=false'], { verify: false });
    assert(['--verify=true'], { verify: true });
  });

  it('should throw an error if a flag is deprecated', () => {
    expect(() => new Cli().parseOptions(['--schema'])).toThrow(
      new RangeError(
        "The flag 'schema' has been deprecated. Use 'default-schema' instead.",
      ),
    );
  });

  it('should throw an error if the config has an invalid schema', () => {
    const assert = (
      config: any,
      message: string,
      path = [Object.keys(config)[0]!],
    ) => {
      expect(() => new Cli().parseOptions([], { config })).toThrow(
        new ConfigError({ message, path }),
      );
    };

    assert({ camelCase: 'true' }, 'Expected boolean, received string');
    assert(
      { dateParser: 'timestamps' },
      "Invalid enum value. Expected 'string' | 'timestamp', received 'timestamps'",
    );
    assert({ defaultSchemas: 'public' }, 'Expected array, received string');
    assert(
      { dialectName: 'sqlite3' },
      "Invalid enum value. Expected 'bun-sqlite' | 'kysely-bun-sqlite' | 'libsql' | 'mssql' | 'mysql' | 'postgres' | 'sqlite' | 'worker-bun-sqlite', received 'sqlite3'",
    );
    assert({ domains: 'true' }, 'Expected boolean, received string');
    assert({ envFile: null }, 'Expected string, received null');
    assert({ excludePattern: null }, 'Expected string, received null');
    assert({ includePattern: null }, 'Expected string, received null');
    assert(
      { logLevel: 0 },
      "Invalid enum value. Expected 'silent' | 'info' | 'warn' | 'error' | 'debug', received '0'",
    );
    assert(
      { numericParser: 'numbers' },
      "Invalid enum value. Expected 'number' | 'number-or-string' | 'string', received 'numbers'",
    );
    assert({ outFile: false }, 'Expected string, received boolean');
    assert({ overrides: { columns: [] } }, 'Expected object, received array', [
      'overrides',
      'columns',
    ]);
    assert({ partitions: 'true' }, 'Expected boolean, received string');
    assert({ print: 'true' }, 'Expected boolean, received string');
    assert({ runtimeEnums: 'true' }, 'Expected boolean, received string');
    assert(
      { runtimeEnumsStyle: 'enums' },
      "Invalid enum value. Expected 'pascal-case' | 'screaming-snake-case', received 'enums'",
    );
    assert({ singular: 'true' }, 'Expected boolean, received string');
    assert({ typeOnlyImports: 'true' }, 'Expected boolean, received string');
    assert({ url: null }, 'Expected string, received null');
    assert({ verify: 'true' }, 'Expected boolean, received string');
  });
});
