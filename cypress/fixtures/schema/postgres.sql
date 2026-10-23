CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL
);

CREATE TABLE posts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  title text
);

CREATE TABLE comments (
  id uuid PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES posts(id),
  user_id uuid NOT NULL REFERENCES users(id),
  body text
);

CREATE VIEW recent_posts AS SELECT * FROM posts;
