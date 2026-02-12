# Contributing to @foxnose/langchain

Thank you for your interest in contributing! This document provides guidelines and information for contributors.

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/FoxNoseTech/langchain-foxnose-js.git
   cd langchain-foxnose-js
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Run the test suite:
   ```bash
   pnpm test
   ```

## Project Structure

```
src/
  index.ts            # Public API exports
  retriever.ts        # FoxNoseRetriever (BaseRetriever)
  loader.ts           # FoxNoseLoader (BaseDocumentLoader)
  tool.ts             # createFoxNoseTool factory
  search.ts           # Search body builder (pure function)
  document-mapper.ts  # Result-to-Document mapper (pure function)
  validation.ts       # Shared validation logic
tests/
  fixtures.ts         # Shared test fixtures and mock factories
  retriever.test.ts   # Retriever tests
  loader.test.ts      # Loader tests
  tool.test.ts        # Tool tests
  search.test.ts      # Search builder tests
  document-mapper.test.ts  # Document mapper tests
  validation.test.ts  # Validation tests
```

## Design Principles

- **DRY**: Shared logic is extracted into `validation.ts`, `search.ts`, and `document-mapper.ts`.
- **SOLID**: Each module has a single responsibility. Types are used as interfaces.
- **Pure functions**: `buildSearchBody` and `mapResultsToDocuments` are side-effect-free and easy to test.
- **Fail-fast validation**: All config errors are caught at construction time, not at runtime.

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage (must be > 90%)
pnpm test:coverage
```

## Code Quality

```bash
# Type checking
pnpm typecheck

# Linting
pnpm lint

# Formatting
pnpm format
```

## Pull Request Process

1. Fork the repository and create a feature branch.
2. Make your changes with appropriate tests (>90% coverage).
3. Run `pnpm typecheck && pnpm lint && pnpm test:coverage` to verify.
4. Submit a pull request with a clear description of the changes.

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
