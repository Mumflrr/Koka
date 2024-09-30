use std::{env, fs, path::PathBuf};

use crate::CONNECTINFO;

pub fn get_chrome_binary_path(url_struct: &CONNECTINFO) -> PathBuf {
    // Set the path to your custom Chrome binary
    let mut path_buf = std::env::current_dir().expect("Failed to get current directory");
    path_buf.push("resources");
    path_buf.push("chrome");

    // Find chromium binary folder
    let paths = fs::read_dir(&path_buf).unwrap();
    let mut name = String::from("");
    for path in paths {
        name = format!("{}", path.unwrap().path().display());
        if name.contains(&url_struct.version) {
            break;
        }
    }
    path_buf.push(&name);

    // There should be only one folder in this folder, so get it
    let paths = fs::read_dir(&path_buf).unwrap();
    for path in paths {
        name = format!("{}", path.unwrap().path().display());
    }
    path_buf.push(&name);

    // Cross-platform compatibility
    match env::consts::OS {
        "macos" => {
            path_buf.push("Google Chrome for Testing.app");
            path_buf.push("Contents");
            path_buf.push("MacOS");
            path_buf.push("Google Chrome for Testing");
        },
        "windows" => {
            path_buf.push("chrome.exe");
        },
        "linux" => {
            path_buf.push("chrome");
        },
        _ => panic!("Unsupported operating system"),
    }

    path_buf
}


#[macro_export]
macro_rules! context_error {
    ($result:expr) => {
        context_error!($result, "")
    };
    ($result:expr, $custom_text:expr) => {{
        use anyhow::Context;
        $result.with_context(|| format!(
            "Error: file-{}, line-{} | {}",
            file!(),
            line!(),
            $custom_text
        ))
    }};
}


#[cfg(test)]
mod tests {
    use anyhow::{Result, anyhow};

    // Helper function to simulate an operation that might fail
    fn fallible_operation(succeed: bool) -> Result<String> {
        if succeed {
            Ok("Operation succeeded".to_string())
        } else {
            Err(anyhow!("Operation failed"))
        }
    }

    #[test]
    fn test_context_error_success() {
        let result: Result<String> = context_error!(fallible_operation(true));
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Operation succeeded");
    }

    #[test]
    fn test_context_error_failure() {
        let result: Result<String> = context_error!(fallible_operation(false));
        assert!(result.is_err());
        let err = result.unwrap_err();
        let err_msg = format!("{:#}", err);

        println!("{}", err_msg);
        
        assert!(err_msg.contains("Operation failed"));
        assert!(err_msg.contains("Error: file-"));
        assert!(err_msg.contains("line-"));
    }

    #[test]
    fn test_context_error_with_custom_text() {
        let result: Result<String> = context_error!(fallible_operation(false), "Custom error message");
        assert!(result.is_err());
        let err = result.unwrap_err();
        let err_msg = format!("{:#}", err);

        println!("{}", err_msg);
        
        assert!(err_msg.contains("Operation failed"));
        assert!(err_msg.contains("Error: file-"));
        assert!(err_msg.contains("line-"));
        assert!(err_msg.contains("Custom error message"));
    }
}