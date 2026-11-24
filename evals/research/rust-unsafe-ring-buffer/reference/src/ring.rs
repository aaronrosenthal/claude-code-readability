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

    pub fn pop(&mut self) -> Option<T> {
        if self.is_empty() {
            return None;
        }
        let front = self.head;
        self.head = self.physical_index(1);
        self.len -= 1;
        // SAFETY: `front` was the first of the `len` initialized slots. `head`
        // and `len` have already moved past it, so no later code reads or drops
        // it a second time.
        Some(unsafe { self.slots[front].assume_init_read() })
    }

    pub fn iter(&self) -> impl Iterator<Item = &T> {
        (0..self.len).map(move |offset| {
            // SAFETY: `offset` ranges over `0..len`.
            unsafe { self.get_unchecked(offset) }
        })
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
