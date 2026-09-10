"""Add missing columns to database tables."""
from dotenv import load_dotenv
load_dotenv()

from database import engine
from sqlalchemy import text

COLUMNS_TO_ADD = [
    # (table, column, definition)
    ("prompts", "tags", "JSON DEFAULT '[]'"),
    ("prompts", "fragment_slugs", "JSON DEFAULT '[]'"),
    ("prompt_versions", "eval_status", "VARCHAR(50) DEFAULT 'none'"),
    ("prompt_versions", "eval_score", "INTEGER"),
]

def main():
    for table, column, definition in COLUMNS_TO_ADD:
        with engine.connect() as conn:
            try:
                sql = f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition}"
                conn.execute(text(sql))
                conn.commit()
                print(f"Added '{column}' to '{table}'")
            except Exception as e:
                conn.rollback()
                if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                    print(f"'{column}' already exists in '{table}'")
                else:
                    print(f"Error: {e}")
    
    print("Done!")

if __name__ == "__main__":
    main()
