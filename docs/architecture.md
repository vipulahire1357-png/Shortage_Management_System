# Architecture

1. Parsers read and normalize source reports.
2. Database helpers manage SQLite connections and transactions.
3. Services contain business calculations and old/new comparisons.
4. The dashboard reads reviewed service outputs.

Keep parser-specific business rules inside the relevant parser until a genuinely shared rule is identified. Avoid destructive schema changes and validate changes using temporary test databases.
