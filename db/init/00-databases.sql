-- n8n keeps its own tables in the "n8n" database (POSTGRES_DB). The run
-- ledger and the portal stand-in each get a database of their own.
create database screening;
create database portal;
