#![no_std]

use gstd::msg;

#[no_mangle]
unsafe extern "C" fn handle() {
    msg::reply_bytes(b"TEST", 0).expect("");
}
