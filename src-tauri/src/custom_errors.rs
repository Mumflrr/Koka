use std::fmt;

pub struct GetElementError {
    err_message: String,
}

impl fmt::Display for GetElementError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", &self.err_message)
    }
}

impl fmt::Debug for GetElementError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("GetElementError").field("err_message", &self.err_message).finish()
    }
}
