use std::{any::type_name, fs, path::PathBuf};

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



    
    // TODO: Cross platform compatability
    path_buf.push("Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");

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
            "Error: file-{}, function-{}, line-{} | {}",
            file!(),
            stringify!(#[function_name]),
            line!(),
            $custom_text
        ))
    }};
}