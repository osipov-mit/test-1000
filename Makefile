build: 
	cargo build --release

install:
	npm install

test:
	npm t

all: install build test