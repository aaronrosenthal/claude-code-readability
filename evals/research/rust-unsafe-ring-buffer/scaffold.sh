#!/usr/bin/env bash
set -euo pipefail
cat > .gitignore <<'EOF'
/target
Cargo.lock
EOF
cat > Cargo.toml <<'EOF'
[package]
name = "ringbuf"
version = "0.2.0"
edition = "2021"

[dependencies]
EOF
mkdir -p src
cat > src/lib.rs <<'EOF'
#![deny(unsafe_op_in_unsafe_fn)]

pub mod ring;

pub use ring::RingBuffer;
EOF
mkdir -p src
cat > src/ring.rs <<'EOF'
use std::mem::MaybeUninit;

pub struct RingBuffer<T> {
    slots: Box<[MaybeUninit<T>]>,
    head: usize,
    len: usize,
}

impl<T> RingBuffer<T> {
    pub fn with_capacity(capacity: usize) -> Self {
        assert!(capacity > 0, "capacity must be non-zero");
        let slots = (0..capacity).map(|_| MaybeUninit::uninit()).collect();
        RingBuffer { slots, head: 0, len: 0 }
    }

    pub fn capacity(&self) -> usize {
        self.slots.len()
    }

    pub fn len(&self) -> usize {
        self.len
    }

    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    pub fn is_full(&self) -> bool {
        self.len == self.capacity()
    }

    pub fn push(&mut self, value: T) -> Result<(), T> {
        if self.is_full() {
            return Err(value);
        }
        let tail = self.physical_index(self.len);
        self.slots[tail].write(value);
        self.len += 1;
        Ok(())
    }

    pub fn peek(&self) -> Option<&T> {
        if self.is_empty() {
            return None;
        }
        // SAFETY: the buffer is not empty, so offset 0 is below `len`.
        Some(unsafe { self.get_unchecked(0) })
    }

    /// # Safety
    ///
    /// `offset` must be less than `self.len()`.
    unsafe fn get_unchecked(&self, offset: usize) -> &T {
        let index = self.physical_index(offset);
        // SAFETY: the caller guarantees `offset < len`. The `len` slots starting
        // at `head` (wrapping around the end) are always initialized, because
        // `push` writes a slot before growing `len`.
        unsafe { self.slots[index].assume_init_ref() }
    }

    fn physical_index(&self, offset: usize) -> usize {
        (self.head + offset) % self.capacity()
    }
}

impl<T> Drop for RingBuffer<T> {
    fn drop(&mut self) {
        for offset in 0..self.len {
            let index = self.physical_index(offset);
            // SAFETY: `offset < len`, so this slot is initialized, and each slot
            // is visited once, so nothing is dropped twice.
            unsafe { self.slots[index].assume_init_drop() };
        }
    }
}
EOF
mkdir -p tests
cat > tests/ring.rs <<'EOF'
use std::rc::Rc;

use ringbuf::RingBuffer;

fn filled(values: &[i32], capacity: usize) -> RingBuffer<i32> {
    let mut buffer = RingBuffer::with_capacity(capacity);
    for &value in values {
        buffer.push(value).unwrap();
    }
    buffer
}

#[test]
fn pop_returns_values_in_fifo_order() {
    let mut buffer = filled(&[1, 2, 3], 4);
    assert_eq!(buffer.pop(), Some(1));
    assert_eq!(buffer.pop(), Some(2));
    assert_eq!(buffer.pop(), Some(3));
    assert_eq!(buffer.pop(), None);
}

#[test]
fn pop_on_an_empty_buffer_is_none() {
    let mut buffer: RingBuffer<String> = RingBuffer::with_capacity(2);
    assert_eq!(buffer.pop(), None);
    assert!(buffer.is_empty());
}

#[test]
fn push_to_a_full_buffer_gives_the_value_back() {
    let mut buffer = filled(&[1, 2], 2);
    assert_eq!(buffer.push(3), Err(3));
    assert_eq!(buffer.len(), 2);
}

#[test]
fn slots_are_reused_after_wrapping_around() {
    let mut buffer = filled(&[1, 2, 3], 3);
    assert_eq!(buffer.pop(), Some(1));
    assert_eq!(buffer.pop(), Some(2));
    buffer.push(4).unwrap();
    buffer.push(5).unwrap();
    assert!(buffer.is_full());
    assert_eq!(buffer.pop(), Some(3));
    assert_eq!(buffer.pop(), Some(4));
    assert_eq!(buffer.pop(), Some(5));
}

#[test]
fn peek_follows_the_front_after_pops() {
    let mut buffer = filled(&[7, 8], 2);
    assert_eq!(buffer.peek(), Some(&7));
    buffer.pop();
    assert_eq!(buffer.peek(), Some(&8));
    buffer.pop();
    assert_eq!(buffer.peek(), None);
}

#[test]
fn iter_yields_oldest_first_without_consuming() {
    let buffer = filled(&[1, 2, 3], 5);
    assert_eq!(buffer.iter().copied().collect::<Vec<_>>(), vec![1, 2, 3]);
    assert_eq!(buffer.len(), 3);
}

#[test]
fn iter_follows_the_wrapped_layout() {
    let mut buffer = filled(&[1, 2, 3], 3);
    buffer.pop();
    buffer.pop();
    buffer.push(4).unwrap();
    buffer.push(5).unwrap();
    assert_eq!(buffer.iter().copied().collect::<Vec<_>>(), vec![3, 4, 5]);
}

#[test]
fn iter_on_an_empty_buffer_yields_nothing() {
    let buffer: RingBuffer<u8> = RingBuffer::with_capacity(3);
    assert_eq!(buffer.iter().count(), 0);
}

#[test]
fn heap_values_survive_pop_and_iter() {
    let mut buffer = RingBuffer::with_capacity(2);
    buffer.push("alpha".to_string()).unwrap();
    buffer.push("beta".to_string()).unwrap();
    let lengths: Vec<usize> = buffer.iter().map(|name| name.len()).collect();
    assert_eq!(lengths, vec![5, 4]);
    assert_eq!(buffer.pop().as_deref(), Some("alpha"));
}

#[test]
fn dropping_the_buffer_drops_only_the_values_still_inside() {
    let tracker = Rc::new(());
    let mut buffer = RingBuffer::with_capacity(3);
    for _ in 0..3 {
        buffer.push(Rc::clone(&tracker)).unwrap();
    }
    assert_eq!(Rc::strong_count(&tracker), 4);

    drop(buffer.pop());
    assert_eq!(Rc::strong_count(&tracker), 3);

    buffer.push(Rc::clone(&tracker)).unwrap();
    assert_eq!(Rc::strong_count(&tracker), 4);

    drop(buffer);
    assert_eq!(Rc::strong_count(&tracker), 1);
}
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
