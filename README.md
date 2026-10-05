# DrikapexInternal

## Supabase configuration

The dashboard reads from the `employees`, `documents`, and `notifications` tables created by the supplied SQL script. Add the public project URL and anon key to `src/environments/environment.ts`:

```ts
export const environment = {
	production: false,
	supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
	supabaseAnonKey: 'YOUR_PUBLIC_ANON_KEY'
};
```

Use only the public anon key in this file. Never put a Supabase service-role key in a frontend build. The tables also need grants/RLS policies that allow the authenticated users of this internal app to select the required rows; the supplied schema does not create those policies.

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.23.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
