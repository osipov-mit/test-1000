#![no_std]

use futures::stream::{FuturesUnordered, StreamExt};
use gstd::{debug, msg, prelude::*, ActorId, Vec};

static mut PROGRAMS: Vec<ActorId> = Vec::new();

#[no_mangle]
pub unsafe extern "C" fn init() {
    let programs: Vec<ActorId> = msg::load().expect("Unable to load msg");
    PROGRAMS.extend(programs.iter().copied());
}

#[gstd::async_main]
async fn main() {
    unsafe {
        let mut futures = Vec::new();
        for n in 0..PROGRAMS.len() {
            futures.push(msg::send_bytes_for_reply(PROGRAMS[n], b"", 0).expect(""))
        }
        let mut f: FuturesUnordered<_> = futures.into_iter().collect();
        while let Some(res) = f.next().await {
            debug!("{:?}", res)
        }
        msg::reply_bytes(b"ok", 0).unwrap();
    }
}
