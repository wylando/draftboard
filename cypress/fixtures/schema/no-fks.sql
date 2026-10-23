CREATE TABLE users (
  id int PRIMARY KEY
);

CREATE TABLE posts (
  id int PRIMARY KEY,
  user_id int
);

CREATE TABLE comments (
  id int PRIMARY KEY,
  post_id int,
  user_id int
);
